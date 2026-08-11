-- Restore default Supabase service_role table privileges.
-- Newer CRM tables were created without SELECT/DML grants for service_role,
-- so client share-link resolution got 403 on immigration_projects/organizations
-- and the fill page incorrectly showed "link expired".

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  TO service_role;

GRANT USAGE, SELECT, UPDATE
  ON ALL SEQUENCES IN SCHEMA public
  TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE
  ON SEQUENCES TO service_role;

-- Portal password verification also uses service_role.
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA private TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA private
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
