import { Router } from 'express';
import { storage } from '../storage';
import { hasPermission } from '../middleware/permissions.js';
import { UserPermission } from '../../shared/schema.js';
import { scanVehiclesForApkChanges } from '../utils/rdw-apk-scanner.js';

const router = Router();

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
router.post('/scan-now', hasPermission(UserPermission.MANAGE_VEHICLES), async (_req, res) => {
  try {
    const result = await scanVehiclesForApkChanges();
    res.json(result);
  } catch (error) {
    console.error('Error running manual APK scan:', error);
    res.status(500).json({ message: 'Failed to run APK scan' });
  }
});

export default router;
