import { Router } from 'express';
import { installIdParamValidation } from '../middleware/parseIntParam';
import { storage } from '../storage';
import { hasPermission } from '../middleware/permissions.js';
import { UserPermission } from '../../shared/schema.js';
import { scanVehiclesForApkChanges, type ApkScanResult } from '../utils/rdw-apk-scanner.js';

const router = Router();
// FIX-E (BUG-103): Express param callbacks do not cross a router mount,
// so this router validates its own `:id`-style parameters itself.
installIdParamValidation(router);

// A full scan takes minutes (one request per vehicle against RDW). Running it
// as a blocking request/response meant any reverse proxy or gateway in front
// of the app (most have a request timeout well under that) would kill the
// connection long before it finished, leaving the client stuck forever
// waiting for a response that was never going to arrive. The scan now runs
// detached from any single request; the client starts it and polls status.
let scanState: {
  running: boolean;
  lastResult: ApkScanResult | null;
  lastError: string | null;
  lastRunAt: string | null;
} = {
  running: false,
  lastResult: null,
  lastError: null,
  lastRunAt: null,
};

// List pending APK date discrepancies (shown in the confirmation dialog on login)
router.get('/', async (_req, res) => {
  try {
    const pending = await storage.getPendingApkDateChanges();
    res.json(pending);
  } catch (error) {
    console.error('Error fetching pending APK date changes:', error);
    res.status(500).json({ message: 'Failed to fetch pending APK date changes' });
  }
});

// Confirm: apply the RDW date to the vehicle
router.post('/:id/confirm', hasPermission(UserPermission.MANAGE_VEHICLES), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const change = await storage.getApkDateChange(id);

    if (!change) {
      return res.status(404).json({ message: 'APK date change not found' });
    }
    if (change.status !== 'pending') {
      return res.status(400).json({ message: 'This change has already been resolved' });
    }

    await storage.updateVehicle(change.vehicleId, { apkDate: change.newApkDate });
    const updated = await storage.updateApkDateChange(id, {
      status: 'confirmed',
      resolvedAt: new Date(),
      resolvedBy: req.user?.username || null,
    });

    res.json(updated);
  } catch (error) {
    console.error('Error confirming APK date change:', error);
    res.status(500).json({ message: 'Failed to confirm APK date change' });
  }
});

// Dismiss: keep the vehicle's current date, stop nagging about this value
router.post('/:id/dismiss', hasPermission(UserPermission.MANAGE_VEHICLES), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const change = await storage.getApkDateChange(id);

    if (!change) {
      return res.status(404).json({ message: 'APK date change not found' });
    }
    if (change.status !== 'pending') {
      return res.status(400).json({ message: 'This change has already been resolved' });
    }

    const updated = await storage.updateApkDateChange(id, {
      status: 'dismissed',
      resolvedAt: new Date(),
      resolvedBy: req.user?.username || null,
    });

    res.json(updated);
  } catch (error) {
    console.error('Error dismissing APK date change:', error);
    res.status(500).json({ message: 'Failed to dismiss APK date change' });
  }
});

// Manually trigger a scan (the scheduled one runs nightly at 02:30) - useful
// for testing and for an admin who doesn't want to wait for the next run.
// Returns immediately; the client polls GET /scan-status for the outcome.
router.post('/scan-now', hasPermission(UserPermission.MANAGE_VEHICLES), (_req, res) => {
  if (scanState.running) {
    return res.json({ started: false, alreadyRunning: true });
  }

  scanState.running = true;
  scanState.lastError = null;

  scanVehiclesForApkChanges()
    .then((result) => {
      scanState.lastResult = result;
      scanState.lastRunAt = new Date().toISOString();
    })
    .catch((error) => {
      console.error('Manual APK scan failed:', error);
      scanState.lastError = error instanceof Error ? error.message : 'Unknown error';
      scanState.lastRunAt = new Date().toISOString();
    })
    .finally(() => {
      scanState.running = false;
    });

  res.json({ started: true, alreadyRunning: false });
});

// Poll while a scan is running; returns the outcome of the most recent one.
router.get('/scan-status', hasPermission(UserPermission.MANAGE_VEHICLES), (_req, res) => {
  res.json(scanState);
});

/**
 * OPT-016 - "Bulkacties met resultaat per rij".
 *
 * Both bulk actions used to answer with a single number. A row that was already
 * resolved, or had been deleted, was counted as "not done" and never named; a
 * failure halfway produced a 500 and the part that *had* been written was
 * invisible. The employee's only option was to check by hand what had happened.
 *
 * This is the shape `server/services/cjib/importer.ts` already uses: one entry
 * per requested row, in the order they were asked for, each with its own
 * outcome — plus the aggregate counts the old clients read.
 */
type BulkRowResult =
  | { id: number; ok: true }
  | { id: number; ok: false; reason: 'not_found' | 'not_pending' | 'error'; message: string };

function summarise(results: BulkRowResult[]) {
  const succeeded = results.filter((r) => r.ok).length;
  return { results, succeeded, failed: results.length - succeeded };
}

/** Shared by both routes: same validation, same per-row isolation. */
async function applyPerRow(
  ids: number[],
  apply: (change: NonNullable<Awaited<ReturnType<typeof storage.getApkDateChange>>>) => Promise<void>,
): Promise<BulkRowResult[]> {
  const results: BulkRowResult[] = [];
  for (const id of ids) {
    try {
      const change = await storage.getApkDateChange(id);
      if (!change) {
        results.push({ id, ok: false, reason: 'not_found', message: 'This APK date change no longer exists.' });
        continue;
      }
      if (change.status !== 'pending') {
        results.push({
          id,
          ok: false,
          reason: 'not_pending',
          message: `Already ${change.status}.`,
        });
        continue;
      }
      await apply(change);
      results.push({ id, ok: true });
    } catch (error) {
      // One bad row must not throw away the rows that already succeeded.
      console.error(`Error handling APK date change ${id}:`, error);
      results.push({
        id,
        ok: false,
        reason: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  return results;
}

function parseIds(body: any): number[] | null {
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return null;
  if (!ids.every((id) => Number.isInteger(id))) return null;
  return ids as number[];
}

// Bulk-dismiss: keep the vehicles' current dates, clear several rows at once
router.post('/bulk-dismiss', hasPermission(UserPermission.MANAGE_VEHICLES), async (req, res) => {
  try {
    const ids = parseIds(req.body);
    if (!ids) {
      return res.status(400).json({ message: 'ids must be a non-empty array of numbers' });
    }

    const resolvedBy = req.user?.username || null;
    const results = await applyPerRow(ids, async (change) => {
      await storage.updateApkDateChange(change.id, {
        status: 'dismissed',
        resolvedAt: new Date(),
        resolvedBy,
      });
    });

    const summary = summarise(results);
    res.json({ ...summary, dismissed: summary.succeeded });
  } catch (error) {
    console.error('Error bulk-dismissing APK date changes:', error);
    res.status(500).json({ message: 'Failed to dismiss the selected APK date changes' });
  }
});

// Bulk-confirm: apply the RDW date to several vehicles at once
router.post('/bulk-confirm', hasPermission(UserPermission.MANAGE_VEHICLES), async (req, res) => {
  try {
    const ids = parseIds(req.body);
    if (!ids) {
      return res.status(400).json({ message: 'ids must be a non-empty array of numbers' });
    }

    const resolvedBy = req.user?.username || null;
    const results = await applyPerRow(ids, async (change) => {
      await storage.updateVehicle(change.vehicleId, { apkDate: change.newApkDate });
      await storage.updateApkDateChange(change.id, {
        status: 'confirmed',
        resolvedAt: new Date(),
        resolvedBy,
      });
    });

    const summary = summarise(results);
    res.json({ ...summary, confirmed: summary.succeeded });
  } catch (error) {
    console.error('Error bulk-confirming APK date changes:', error);
    res.status(500).json({ message: 'Failed to confirm the selected APK date changes' });
  }
});

export default router;
