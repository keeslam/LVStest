import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { AuditLogger } from '../utils/security/auditLogger';

/**
 * Records every request that changes data, so the activity log can answer
 * "who changed what, and when".
 *
 * This runs as one middleware instead of a call in each route: routes.ts holds
 * hundreds of endpoints, and per-route logging would drift the moment someone
 * adds an endpoint without remembering to log it.
 *
 * For the entities below it also fetches the row BEFORE the handler runs and
 * compares it against the handler's own JSON response, which is what turns a
 * bare "vehicle.update" into "mileage 55.829 -> 5.526".
 */

// Resource segment in the URL -> how to read a single row and how to name it
const TRACKED_RESOURCES: Record<string, {
  type: string;
  load: (id: number) => Promise<any>;
  label: (row: any) => string | null;
}> = {
  vehicles: {
    type: 'vehicle',
    load: (id) => storage.getVehicle(id),
    label: (row) => row?.licensePlate || [row?.brand, row?.model].filter(Boolean).join(' ') || null,
  },
  customers: {
    type: 'customer',
    load: (id) => storage.getCustomer(id),
    label: (row) => row?.companyName || row?.name || null,
  },
  reservations: {
    type: 'reservation',
    load: (id) => storage.getReservation(id),
    label: (row) => row?.contractNumber ? `#${row.id} (${row.contractNumber})` : (row?.id ? `#${row.id}` : null),
  },
  expenses: {
    type: 'expense',
    load: (id) => storage.getExpense(id),
    label: (row) => row?.description || row?.category || null,
  },
  documents: {
    type: 'document',
    load: (id) => storage.getDocument(id),
    label: (row) => row?.fileName || row?.documentType || null,
  },
  users: {
    type: 'user',
    load: (id) => storage.getUser(id),
    label: (row) => row?.username || null,
  },
};

// Never store these, in a diff or anywhere else
const SECRET_FIELDS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'mileageoverridepassword',
  'overridepassword',
  'token',
  'secret',
  'apikey',
  'smtppassword',
]);

// Bookkeeping columns - they change on every write and say nothing
const IGNORED_FIELDS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'createdByUser',
  'updatedByUser',
]);

// Paths that would flood the log without saying anything about the data
const SKIPPED_PATH_PATTERNS = [
  /^\/api\/login$/,
  /^\/api\/logout$/,
  /^\/api\/register$/,
  /^\/api\/notifications\/.*\/read$/,
  /^\/api\/notifications\/read-all$/,
  /^\/api\/csrf/,
  /^\/api\/preview-token/,
];

const isSecret = (field: string) => SECRET_FIELDS.has(field.toLowerCase());

function summarize(value: any): any {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return `[${value.length} items]`;
  try {
    const json = JSON.stringify(value);
    return json.length > 200 ? `${json.slice(0, 200)}…` : json;
  } catch {
    return '[unserializable]';
  }
}

function sameValue(a: any, b: any): boolean {
  const left = a instanceof Date ? a.toISOString() : a;
  const right = b instanceof Date ? b.toISOString() : b;
  if (left === right) return true;
  if (left === null && right === undefined) return true;
  if (left === undefined && right === null) return true;
  if (typeof left === 'object' && typeof right === 'object' && left && right) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }
  // The API answers with strings where the DB holds numbers and vice versa
  if (left != null && right != null && String(left) === String(right)) return true;
  return false;
}

function diffRows(before: any, after: any): Array<{ field: string; from: any; to: any }> {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [];

  const changes: Array<{ field: string; from: any; to: any }> = [];
  for (const field of Object.keys(after)) {
    if (IGNORED_FIELDS.has(field) || isSecret(field)) continue;
    if (!(field in before)) continue;
    if (sameValue(before[field], after[field])) continue;
    changes.push({ field, from: summarize(before[field]), to: summarize(after[field]) });
  }
  return changes;
}

function sanitizeBody(body: any): Record<string, any> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const result: Record<string, any> = {};
  for (const [field, value] of Object.entries(body)) {
    if (isSecret(field)) continue;
    result[field] = summarize(value);
  }
  return Object.keys(result).length > 0 ? result : null;
}

function describeRequest(path: string) {
  // /api/vehicles/12/mileage -> ['vehicles', '12', 'mileage']
  const segments = path.replace(/^\/api\//, '').split('/').filter(Boolean);
  const resourceSegment = segments[0] || 'unknown';
  const idSegment = segments[1];
  const id = idSegment && /^\d+$/.test(idSegment) ? parseInt(idSegment, 10) : null;
  const tracked = TRACKED_RESOURCES[resourceSegment];
  const type = tracked?.type || resourceSegment.replace(/s$/, '');
  const subAction = id !== null ? segments.slice(2).join('.') : segments.slice(1).join('.');
  return { resourceSegment, id, type, tracked, subAction: subAction || null };
}

function verbFor(method: string): string {
  switch (method) {
    case 'POST': return 'create';
    case 'PUT':
    case 'PATCH': return 'update';
    case 'DELETE': return 'delete';
    default: return 'change';
  }
}

export function auditMutations(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();
  if (!req.path.startsWith('/api/')) return next();
  if (SKIPPED_PATH_PATTERNS.some((pattern) => pattern.test(req.path))) return next();

  const { id, type, tracked, subAction } = describeRequest(req.path);
  const requestBody = sanitizeBody(req.body);

  // Capture what the handler answers, so an update can be diffed against the
  // row as it was before.
  let responseBody: any = null;
  const originalJson = res.json.bind(res);
  (res as any).json = (body: any) => {
    responseBody = body;
    return originalJson(body);
  };

  const loadBefore = async () => {
    if (!tracked || id === null || method === 'POST') return null;
    try {
      return await tracked.load(id);
    } catch {
      return null;
    }
  };

  loadBefore().then((before) => {
    res.on('finish', () => {
      // Only successful writes are activity; failures are noise here and the
      // security-relevant ones (login, delete confirmations) log themselves.
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      const user = (req as any).user;
      if (!user) return;

      const changes = diffRows(before, responseBody);
      const label = tracked?.label(responseBody && typeof responseBody === 'object' ? responseBody : before) || null;

      const details: Record<string, any> = {};
      if (label) details.label = label;
      if (subAction) details.operation = subAction;
      if (changes.length > 0) details.changes = changes.slice(0, 25);
      if (changes.length === 0 && requestBody) details.request = requestBody;
      details.path = req.originalUrl.split('?')[0];

      // An update that changed nothing is not worth a line
      if (method !== 'POST' && method !== 'DELETE' && before && changes.length === 0 && !subAction) return;

      void AuditLogger.logFromRequest(
        req,
        `${type}.${verbFor(method)}`,
        type,
        id !== null ? id : (responseBody?.id ?? undefined),
        details,
        'success',
      );
    });

    next();
  }).catch(() => next());
}
