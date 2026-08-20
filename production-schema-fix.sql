-- Production database schema update
-- Run this in your Coolify PostgreSQL database

-- Add missing maintenance columns if they don't exist
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS maintenance_status text DEFAULT 'ok' NOT NULL;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS maintenance_note text;

-- Add missing tracking columns if they don't exist  
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS company_by text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS registered_to_by text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS production_date text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS imei text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS updated_by text;

-- Add missing columns to customers if they don't exist
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_user_id integer;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_by_user_id integer;

-- Add foreign key constraints if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'customers_created_by_user_id_users_id_fk'
    ) THEN
        ALTER TABLE customers ADD CONSTRAINT customers_created_by_user_id_users_id_fk 
        FOREIGN KEY (created_by_user_id) REFERENCES users(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'customers_updated_by_user_id_users_id_fk'
    ) THEN
        ALTER TABLE customers ADD CONSTRAINT customers_updated_by_user_id_users_id_fk 
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id);
    END IF;
END $$;

-- Update existing vehicles to have default maintenance status
UPDATE vehicles SET maintenance_status = 'ok' WHERE maintenance_status IS NULL;

-- Show updated schema
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'vehicles' 
ORDER BY ordinal_position;