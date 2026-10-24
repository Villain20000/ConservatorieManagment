-- Backfill document registry metadata from the MVP reference number and title.

UPDATE "document_records"
SET "protocolNumber" = "referenceNumber"
WHERE "protocolNumber" IS NULL
  AND "referenceNumber" IS NOT NULL;

-- Ensure per-tenant uniqueness before the unique index is created.
WITH duplicated AS (
    SELECT
        "id",
        row_number() OVER (
            PARTITION BY "tenantId", "protocolNumber"
            ORDER BY "createdAt", "id"
        ) AS position
    FROM "document_records"
    WHERE "protocolNumber" IS NOT NULL
)
UPDATE "document_records" d
SET "protocolNumber" = d."protocolNumber" || '-' || duplicated.position
FROM duplicated
WHERE d."id" = duplicated."id"
  AND duplicated.position > 1;

UPDATE "document_records"
SET "templateKey" = 'registration-form.v1',
    "templateVersion" = 1
WHERE "templateKey" IS NULL;

UPDATE "document_records"
SET "signatureStatus" = 'NONE'
WHERE "signatureStatus" IS NULL;
