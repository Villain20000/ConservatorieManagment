-- Drops every constraint created by the `foundation_hardening` migration.
-- Only for development: it makes the migration re-runnable after a failed
-- attempt inside a pooled transaction (PostgreSQL DDL is transactional, but a
-- failed statement in dev leaves an explicit transaction open).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE conname ~ '_(chk)$'
      AND connamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;
