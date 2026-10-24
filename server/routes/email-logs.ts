import { Router } from 'express';
import { installIdParamValidation } from '../middleware/parseIntParam';
import { db } from '../db.js';
import { emailLogs } from '../../shared/schema.js';
import { eq, desc } from 'drizzle-orm';
import { parseEmailLogQuery, searchEmailLogs, summariseEmailLogs, exportEmailLogs } from '../services/email-log-query';

const router = Router();
// FIX-E (BUG-103): Express param callbacks do not cross a router mount,
// so this router validates its own `:id`-style parameters itself.
installIdParamValidation(router);

// Get all email logs (most recent first)
router.get('/', async (req, res) => {
  try {
    const logs = await db.select().from(emailLogs).orderBy(desc(emailLogs.sentAt));
    res.json(logs);
  } catch (error) {
    console.error('Error fetching email logs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch email logs',
      // The exception is logged above; its text (relation names, paths) never goes on the wire.
      message: 'Failed to fetch email logs',
      code: 'EMAIL_LOG_LIST_FAILED',
    });
  }
});

// The E-maillogboek table: one page, searched, filtered and sorted here so the
// browser never loads the whole log (services/email-log-query.ts). These three
// are registered before `/:id`, which would otherwise take "search" as an id.
router.get('/search', async (req, res) => {
  try {
    res.json(await searchEmailLogs(parseEmailLogQuery(req.query as Record<string, unknown>)));
  } catch (error) {
    console.error('Error searching email logs:', error);
    res.status(500).json({ error: 'Failed to search email logs', message: 'Failed to search email logs', code: 'EMAIL_LOG_SEARCH_FAILED' });
  }
});

// Totals for the Analyse tab.
router.get('/summary', async (_req, res) => {
  try {
    res.json(await summariseEmailLogs());
  } catch (error) {
    console.error('Error summarising email logs:', error);
    res.status(500).json({ error: 'Failed to summarise email logs', message: 'Failed to summarise email logs', code: 'EMAIL_LOG_SUMMARY_FAILED' });
  }
});

// Every row matching the filters, for the CSV download the client writes.
router.get('/export', async (req, res) => {
  try {
    res.json(await exportEmailLogs(parseEmailLogQuery(req.query as Record<string, unknown>)));
  } catch (error) {
    console.error('Error exporting email logs:', error);
    res.status(500).json({ error: 'Failed to export email logs', message: 'Failed to export email logs', code: 'EMAIL_LOG_EXPORT_FAILED' });
  }
});

// Get email log by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid log ID' });
    }

    const log = await db.select().from(emailLogs).where(eq(emailLogs.id, id));
    
    if (log.length === 0) {
      return res.status(404).json({ error: 'Email log not found' });
    }

    res.json(log[0]);
  } catch (error) {
    console.error('Error fetching email log:', error);
    res.status(500).json({ 
      error: 'Failed to fetch email log',
      // The exception is logged above; its text (relation names, paths) never goes on the wire.
      message: 'Failed to fetch email log',
      code: 'EMAIL_LOG_READ_FAILED',
    });
  }
});

// Create new email log entry
router.post('/', async (req, res) => {
  try {
    const { 
      template, 
      subject, 
      recipients, 
      emailsSent, 
      emailsFailed, 
      failureReason, 
      vehicleIds 
    } = req.body;

    if (!template || !subject || recipients === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newLog = await db.insert(emailLogs).values({
      template,
      subject,
      recipients,
      emailsSent: emailsSent || 0,
      emailsFailed: emailsFailed || 0,
      failureReason: failureReason || null,
      vehicleIds: vehicleIds || [],
      sentAt: new Date().toISOString(),
    }).returning();

    console.log('Created email log:', newLog[0]);
    res.status(201).json(newLog[0]);
  } catch (error) {
    console.error('Error creating email log:', error);
    res.status(500).json({ 
      error: 'Failed to create email log',
      // The exception is logged above; its text (relation names, paths) never goes on the wire.
      message: 'Failed to create email log',
      code: 'EMAIL_LOG_CREATE_FAILED',
    });
  }
});

export default router;