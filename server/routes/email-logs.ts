import { Router } from 'express';
import { db } from '../db.js';
import { emailLogs } from '../../shared/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = Router();

// Get all email logs (most recent first)
router.get('/', async (req, res) => {
  try {
    const logs = await db.select().from(emailLogs).orderBy(desc(emailLogs.sentAt));
    res.json(logs);
  } catch (error) {
    console.error('Error fetching email logs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch email logs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
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
      details: error instanceof Error ? error.message : 'Unknown error'
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
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;