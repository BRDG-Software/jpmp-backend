-- Migration to add client_kiosk_id to kiosks table
BEGIN;

-- First, ensure no existing fulfill kiosks
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM kiosks WHERE role = 'fulfill') THEN
    RAISE EXCEPTION 'Cannot apply migration: Existing kiosks with role = ''fulfill'' found. Please update these kiosks with client_kiosk_id values first.';
  END IF;
END $$;

-- Add the new column without constraints first
ALTER TABLE kiosks
ADD COLUMN client_kiosk_id INTEGER;

-- Add foreign key reference
ALTER TABLE kiosks
ADD CONSTRAINT kiosks_client_kiosk_id_fkey
FOREIGN KEY (client_kiosk_id)
REFERENCES kiosks(id);

-- Add check constraint
ALTER TABLE kiosks
ADD CONSTRAINT client_kiosk_role_check
CHECK (
  (role = 'fulfill' AND client_kiosk_id IS NOT NULL) OR
  (role != 'fulfill' AND client_kiosk_id IS NULL)
);

COMMIT;

-- Rollback SQL if needed:
/*
BEGIN;
ALTER TABLE kiosks DROP CONSTRAINT client_kiosk_role_check;
ALTER TABLE kiosks DROP CONSTRAINT kiosks_client_kiosk_id_fkey;
ALTER TABLE kiosks DROP COLUMN client_kiosk_id;
COMMIT;
*/
