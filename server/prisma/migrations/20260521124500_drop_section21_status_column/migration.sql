-- Drop the composite index that depends on the status column.
DROP INDEX IF EXISTS "Section21Declaration_userId_status_idx";

-- Remove persisted declaration status; status is derived at read-time from nextDueDate.
ALTER TABLE "Section21Declaration" DROP COLUMN IF EXISTS "status";

-- Remove enum type now that no column references it.
DROP TYPE IF EXISTS "Section21DeclarationStatus";
