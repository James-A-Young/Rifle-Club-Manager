DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    INNER JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'BackupDataset'
      AND e.enumlabel = 'MEMBER_DEMOGRAPHICS'
  ) THEN
    ALTER TYPE "BackupDataset" ADD VALUE 'MEMBER_DEMOGRAPHICS';
  END IF;
END
$$;
