-- Documents v2: approval tracking + file version counter.

ALTER TABLE "document_records" ADD COLUMN "approvedById" UUID;
ALTER TABLE "document_records" ADD COLUMN "approvedAt" TIMESTAMPTZ(3);
ALTER TABLE "document_records" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_records_approvedById_fkey'
  ) THEN
    ALTER TABLE "document_records"
      ADD CONSTRAINT "document_records_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
