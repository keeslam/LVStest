import { Router } from 'express';
import { installIdParamValidation } from '../middleware/parseIntParam';
import { getMileageHistory, setMileageReadingVoided } from '../services/mileage-history';
import { officeTimeZone } from '../services/office-time';
import { dateInZone } from '../../shared/office-timezone';

const router = Router();
// Express param callbacks do not cross a router mount, so validate `:vehicleId` here.
installIdParamValidation(router);

/** yyyy-mm-dd and a real calendar date (no 2026-02-30). */
function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

// Kilometerhistorie of one vehicle (admin only; mounted with requireAdmin).
router.get('/:vehicleId', async (req, res) => {
  try {
    const vehicleId = parseInt(req.params.vehicleId, 10);
    if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
      return res.status(400).json({ message: 'Invalid vehicle id', code: 'INVALID_ID' });
    }
    const today = dateInZone(new Date(), officeTimeZone());
    const rawFrom = req.query.from;
    const rawTo = req.query.to;
    const from = rawFrom === undefined || rawFrom === '' ? `${today.slice(0, 4)}-01-01` : rawFrom;
    const to = rawTo === undefined || rawTo === '' ? today : rawTo;
    if (typeof from !== 'string' || typeof to !== 'string' || !isRealDate(from) || !isRealDate(to) || from > to) {
      return res.status(400).json({ message: 'Invalid date range', code: 'INVALID_DATE' });
    }
    const history = await getMileageHistory(vehicleId, from, to);
    if (!history) return res.status(404).json({ message: 'Vehicle not found', code: 'VEHICLE_NOT_FOUND' });
    res.json(history);
  } catch (error) {
    console.error('Error fetching mileage history:', error);
    res.status(500).json({ message: 'Failed to fetch mileage history', code: 'MILEAGE_HISTORY_FAILED' });
  }
});

// Eén stand laten vervallen of weer geldig maken, bijv. een tikfout
// (alleen beheerder, zoals de hele router). De auditlaag legt vast wie het deed.
for (const [action, voided] of [['void', true], ['unvoid', false]] as const) {
  router.post(`/readings/:id/${action}`, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'Invalid reading id', code: 'INVALID_ID' });
      }
      const by = (req.user as { username?: string } | undefined)?.username ?? 'systeem';
      const row = await setMileageReadingVoided(id, voided, by);
      if (!row) return res.status(404).json({ message: 'Reading not found', code: 'READING_NOT_FOUND' });
      res.json(row);
    } catch (error) {
      console.error(`Error trying to ${action} mileage reading:`, error);
      res.status(500).json({ message: 'Failed to update mileage reading', code: 'MILEAGE_READING_UPDATE_FAILED' });
    }
  });
}

export default router;
