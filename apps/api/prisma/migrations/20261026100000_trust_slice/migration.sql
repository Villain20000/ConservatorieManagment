CREATE UNIQUE INDEX "subscription_invoices_subscriptionId_periodStart_key"
  ON "subscription_invoices"("subscriptionId", "periodStart");

ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_granted_basis_chk"
  CHECK ("action" <> 'GRANTED' OR ("legalBasis" IS NOT NULL AND length(btrim("legalBasis")) > 0));

ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_due_after_created_chk"
  CHECK ("dueAt" > "createdAt");
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_completed_consistency_chk"
  CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL));

CREATE OR REPLACE FUNCTION prevent_consent_event_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'consent_events is append-only';
END;
$$;

CREATE TRIGGER consent_events_append_only
  BEFORE UPDATE ON "consent_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_consent_event_update();
