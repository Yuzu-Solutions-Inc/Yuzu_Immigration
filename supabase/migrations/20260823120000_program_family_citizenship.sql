-- Add citizenship to program_family enum for CIT 0002 kit seeding.
ALTER TYPE program_family ADD VALUE IF NOT EXISTS 'citizenship' BEFORE 'other';
