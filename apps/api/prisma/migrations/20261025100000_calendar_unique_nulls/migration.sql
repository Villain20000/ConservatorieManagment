-- The unique rule for `calendar_days` must treat two tenant-wide rows (branchId
-- IS NULL) as duplicates. PostgreSQL's default UNIQUE treats NULLs as distinct,
-- so the previous index never fired for tenant-wide holidays and the API
-- accepted duplicates that the service intended to reject. Nulls are therefore
-- made non-distinct for this index only.
DROP INDEX IF EXISTS "calendar_days_tenantId_branchId_date_kind_key";
CREATE UNIQUE INDEX "calendar_days_tenantId_branchId_date_kind_key"
  ON "calendar_days"("tenantId", "branchId", "date", "kind") NULLS NOT DISTINCT;
