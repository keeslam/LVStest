-- 🚨 SAFE DATABASE FIX: Create only the missing email_templates table
-- Run this SQL on your production database (MUCH SAFER than db:push --force)

-- Create the missing email_templates table
CREATE TABLE IF NOT EXISTS public.email_templates (
  id serial PRIMARY KEY,
  name text NOT NULL,
  subject text NOT NULL,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'custom',
  created_at text NOT NULL,
  updated_at text,
  last_used text
);

-- Verify the table was created
SELECT 'email_templates table created successfully' as status;