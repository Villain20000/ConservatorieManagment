-- Backfill finance data from the MVP read-only model:
-- receipt numbers, allocations and charge paid amounts.

WITH numbered AS (
    SELECT
        "id",
        'LEG-' || to_char("paidAt", 'YYYY') || '-' ||
        lpad(
            row_number() OVER (
                PARTITION BY "tenantId", date_part('year', "paidAt")
                ORDER BY "paidAt", "id"
            )::text,
            6,
            '0'
        ) AS receipt
    FROM "payments"
    WHERE "receiptNumber" IS NULL
)
UPDATE "payments" p
SET "receiptNumber" = numbered.receipt
FROM numbered
WHERE p."id" = numbered."id";

INSERT INTO "payment_allocations" ("id", "tenantId", "paymentId", "chargeId", "amountCents")
SELECT
    gen_random_uuid(),
    p."tenantId",
    p."id",
    p."chargeId",
    p."amountCents"
FROM "payments" p
WHERE p."chargeId" IS NOT NULL
ON CONFLICT ("paymentId", "chargeId") DO NOTHING;

UPDATE "charges" c
SET "paidAmountCents" = totals.total
FROM (
    SELECT a."chargeId", SUM(a."amountCents")::int AS total
    FROM "payment_allocations" a
    JOIN "payments" p ON p."id" = a."paymentId"
    WHERE p."status" = 'POSTED'
    GROUP BY a."chargeId"
) AS totals
WHERE c."id" = totals."chargeId";

UPDATE "charges"
SET "status" = (
    CASE
        WHEN "status" = 'CANCELLED' THEN 'CANCELLED'
        WHEN "paidAmountCents" >= "amountCents" THEN 'PAID'
        WHEN "paidAmountCents" > 0 THEN 'PARTIAL'
        WHEN "dueDate" < CURRENT_DATE THEN 'OVERDUE'
        ELSE 'PENDING'
    END
)::"ChargeStatus";
