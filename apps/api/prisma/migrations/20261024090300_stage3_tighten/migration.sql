-- Tighten constraints after backfill.

ALTER TABLE "payments" ALTER COLUMN "receiptNumber" SET NOT NULL;

CREATE UNIQUE INDEX "payments_tenantId_receiptNumber_key" ON "payments"("tenantId", "receiptNumber");
CREATE UNIQUE INDEX "document_records_tenantId_protocolNumber_key" ON "document_records"("tenantId", "protocolNumber");
