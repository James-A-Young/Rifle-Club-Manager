-- Add optional friendly names for firearms and snapshot support for visit history display fallback.
ALTER TABLE "Firearm"
ADD COLUMN "friendlyName" TEXT;

ALTER TABLE "VisitLog"
ADD COLUMN "firearmFriendlyNameSnapshot" TEXT;
