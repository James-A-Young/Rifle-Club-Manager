-- Store optional coordinates for wallet pass relevance near club premises.
ALTER TABLE "ClubSettings"
ADD COLUMN "clubLatitude" DOUBLE PRECISION,
ADD COLUMN "clubLongitude" DOUBLE PRECISION;
