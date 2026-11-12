-- Repair the observed column rename without replacing account data or replaying 002.
-- On databases with the expected schema this migration has no effect.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'first_name'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'Prajwal'
    ) THEN
      ALTER TABLE users RENAME COLUMN "Prajwal" TO first_name;
    ELSE
      RAISE EXCEPTION 'users.first_name is missing; inspect the users schema before repairing it';
    END IF;
  END IF;
END $$;
