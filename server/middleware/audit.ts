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
 *
 * Reads are not logged - a list screen would fill the log with nothing - with
 * one exception: opening, downloading or printing a file (TRACKED_READS). Those
 * answer "who looked at this contract" and "who printed the damage report",
 * which the owner wants in the same log. A print the browser does from an
 * already-loaded preview never reaches the server; the client reports it to
 * POST /api/audit-events, and a print that does load the file carries
 * `?intent=print` so the same request is logged as a print, not a view.
 */

/**
 * The file reads worth a line. `$1` is the record id where the URL has one.
 * `?intent=print` on any of these turns the verb into `print`.
 */
const TRACKED_READS: Array<{ pattern: RegExp; type: string; verb: string }> = [
  { pattern: /^\/api\/documents\/view\/(\d+)$/, type: 'document', verb: 'view' },
  { pattern: /^\/api\/documents\/download\/(\d+)$/, type: 'document', verb: 'download' },
  // Contract / damage-report PDFs generated on the fly for a reservation
  { pattern: /^\/api\/contracts\/generate(?:-default)?\/(\d+)$/, type: 'reservation', verb: 'contract-pdf' },
  { pattern: /^\/api\/damage-checks\/generate\/(\d+)$/, type: 'reservation', verb: 'damage-check-pdf' },
  { pattern: /^\/api\/vehicles\/(\d+)\/damage-check-pdf$/, type: 'vehicle', verb: 'damage-check-pdf' },
  // Same type name the write middleware derives from the URL, so the PDF opens
  // show up in the same record history as the check's creation.
  { pattern: /^\/api\/interactive-damage-checks\/(\d+)\/pdf$/, type: 'interactive-damage-check', verb: 'pdf' },
  { pattern: /^\/api\/drivers\/(\d+)\/license$/, type: 'driver', verb: 'license-view' },
  { pattern: /^\/api\/expenses\/(\d+)\/receipt$/, type: 'expense', verb: 'receipt-view' },
  { pattern: /^\/api\/expenses\/inbox\/items\/(\d+)\/file$/, type: 'invoice-inbox-item', verb: 'view' },
  { pattern: /^\/api\/fines\/(\d+)\/letter$/, type: 'fine', verb: 'letter-view' },
  { pattern: /^\/api\/fines\/imports\/(\d+)\/file$/, type: 'fine-import', verb: 'view' },
  { pattern: /^\/api\/fiscal\/assessments\/(\d+)\/pdf$/, type: 'fiscal-assessment', verb: 'pdf' },
  { pattern: /^\/api\/fiscal\/reports\/monthly\.csv$/, type: 'fiscal-report', verb: 'export' },
  { pattern: /^\/api\/portal-requests\/(\d+)\/attachments\/\d+$/, type: 'portal-request', verb: 'attachment-view' },
  { pattern: /^\/api\/damage-check-templates\/(\d+)\/export$/, type: 'damage-check-template', verb: 'export' },
  { pattern: /^\/api\/backups\/download(?:-data|-code|-files|\/.+)$/, type: 'backup', verb: 'download' },
];

export interface TrackedRead {
  action: string;
  type: string;
  id: number | null;
  verb: string;
}

/** Which audit row a GET of this path is worth, or null for an ordinary read. */
export function describeRead(path: string, intent?: unknown): TrackedRead | null {
  const clean = path.split('?')[0];
  for (const entry of TRACKED_READS) {
    const match = entry.pattern.exec(clean);
    if (!match) continue;
    const id = match[1] && /^\d+$/.test(match[1]) ? parseInt(match[1], 10) : null;
    const verb = intent === 'print' ? 'print' : entry.verb;
    return { action: `${entry.type}.${verb}`, type: entry.type, id, verb };
  }
  return null;
}

/**
 * Writes the row for a tracked read, named after the record where it can be
 * (the document's file name, the vehicle's plate). Shared with the
 * /api/audit-events route, which reports the prints the server never sees.
 */
export async function recordRead(req: Request, read: TrackedRead, extra: Record<string, any> = {}): Promise<void> {
  const details: Record<string, any> = { operation: read.verb, ...extra };
  const tracked = Object.values(TRACKED_RESOURCES).find((entry) => entry.type === read.type);
  if (tracked && read.id !== null) {
    try {
      const label = tracked.label(await tracked.load(read.id));
      if (label) details.label = label;
    } catch {
      // The name is a nicety; the row is not.
    }
  }
  if (!details.path) details.path = req.originalUrl.split('?')[0];
  await AuditLogger.logFromRequest(req, read.action, read.type, read.id ?? undefined, details, 'success');
}

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
  // Sub-project D (B-41 D8): `driver.delete` names the driver (its snapshot is in the bin).
  drivers: {
    type: 'driver',
    load: (id) => storage.getDriver(id),
    label: (row) => row?.displayName || null,
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

/**
 * Routes that already write their own, richer audit entry (BUG-147).
 *
 * Matched **per method**: `DELETE /api/vehicles/:id` logs the typed
 * confirmation and the recycle-bin record itself, so logging it here as well
 * gave every vehicle deletion two `vehicle.delete` rows - 15 of them for one
 * vehicle in the audit database - and made the one question that matters
 * after an incident ("who deleted this car") read as if it happened twice.
 * `PATCH /api/vehicles/:id` is a different method and is still logged here.
 */
const SELF_LOGGED: Array<{ method: string; pattern: RegExp }> = [
  { method: 'DELETE', pattern: /^\/api\/vehicles\/\d+$/ },
  { method: 'POST', pattern: /^\/api\/deleted-records\/\d+\/restore$/ },
  // Sub-project C task 7: emptying a bin logs one `<entityType>.purge` row per record, as
  // each one is done (a long purge the client stops waiting for still leaves its trail).
  { method: 'DELETE', pattern: /^\/api\/deleted-records\/\d+$/ },
  { method: 'POST', pattern: /^\/api\/deleted-records\/purge$/ },
  // Sub-project C: the route writes `reservation.revert` itself, with the plan
  // (what was cleared, which readings went back, which documents went stale).
  { method: 'POST', pattern: /^\/api\/reservations\/\d+\/revert$/ },
  // D17: applying the RDW type plan writes one `vehicle.type-remap` row per vehicle itself, and
  // the check only stores a plan. Neither is a `vehicle.create`.
  { method: 'POST', pattern: /^\/api\/vehicles\/rdw-type-remap\/(check|apply)$/ },
  // The client's own print/export reports: the route writes the row it describes.
  { method: 'POST', pattern: /^\/api\/audit-events$/ },
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
  if (!req.path.startsWith('/api/')) return next();

  if (method === 'GET') {
    const read = describeRead(req.path, req.query?.intent);
    if (!read) return next();
    res.on('finish', () => {
      // A 404 or 403 is not "looked at"; the security log has the refusals.
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      if (!(req as any).user) return;
      void recordRead(req, read);
    });
    return next();
  }

  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();
  if (SKIPPED_PATH_PATTERNS.some((pattern) => pattern.test(req.path))) return next();
  if (SELF_LOGGED.some((entry) => entry.method === method && entry.pattern.test(req.path))) return next();

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
      // A delete answers with a message, not the row: name what it removed from the row as it was before.
      const labelSource = method === 'DELETE' ? (before ?? responseBody) : (responseBody && typeof responseBody === 'object' ? responseBody : before);
      const label = tracked?.label(labelSource) || null;

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
        // BUG-152: every reservation sub-action was logged as
        // `reservation.create`, with the real operation buried in `details`,
        // so the activity log said "reservering aangemaakt" three times for
        // one rental and filtering on the action was misleading.
        subAction && id !== null
          ? `${type}.${subAction.split(".")[0]}`
          : `${type}.${verbFor(method)}`,
        type,
        id !== null ? id : (responseBody?.id ?? undefined),
        details,
        'success',
      );
    });

    next();
  }).catch(() => next());
}
