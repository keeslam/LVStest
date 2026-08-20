import { Router } from 'express';
import { db } from '../db.js';
import { emailTemplates } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// Create email template validation schema
const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  subject: z.string().min(1, 'Subject is required'),
  content: z.string().min(1, 'Content is required'),
  category: z.enum(['apk', 'maintenance', 'custom']).default('custom'),
});

const updateTemplateSchema = createTemplateSchema;

// Get all email templates
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    
    let templates;
    
    // Filter by category if provided
    if (category && typeof category === 'string') {
      const validCategories = ['apk', 'maintenance', 'custom'];
      if (validCategories.includes(category)) {
        templates = await db.select().from(emailTemplates).where(eq(emailTemplates.category, category));
      } else {
        templates = await db.select().from(emailTemplates);
      }
    } else {
      templates = await db.select().from(emailTemplates);
    }
    
    res.json(templates);
  } catch (error) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({ 
      error: 'Failed to fetch email templates',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get email template by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    const template = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
    
    if (template.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template[0]);
  } catch (error) {
    console.error('Error fetching email template:', error);
    res.status(500).json({ 
      error: 'Failed to fetch email template',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create new email template
router.post('/', async (req, res) => {
  try {
    const result = createTemplateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: result.error.issues 
      });
    }

    const { name, subject, content, category } = result.data;

    const newTemplate = await db.insert(emailTemplates).values({
      name,
      subject,
      content,
      category,
      createdAt: new Date().toISOString(),
    }).returning();

    console.log('Created email template:', newTemplate[0]);
    res.status(201).json(newTemplate[0]);
  } catch (error) {
    console.error('Error creating email template:', error);
    res.status(500).json({ 
      error: 'Failed to create email template',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update email template
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    const result = updateTemplateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: result.error.issues 
      });
    }

    const { name, subject, content, category } = result.data;

    const updatedTemplate = await db.update(emailTemplates)
      .set({
        name,
        subject,
        content,
        category,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(emailTemplates.id, id))
      .returning();

    if (updatedTemplate.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    console.log('Updated email template:', updatedTemplate[0]);
    res.json(updatedTemplate[0]);
  } catch (error) {
    console.error('Error updating email template:', error);
    res.status(500).json({ 
      error: 'Failed to update email template',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete email template
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    const deletedTemplate = await db.delete(emailTemplates)
      .where(eq(emailTemplates.id, id))
      .returning();

    if (deletedTemplate.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    console.log('Deleted email template:', deletedTemplate[0]);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting email template:', error);
    res.status(500).json({ 
      error: 'Failed to delete email template',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;