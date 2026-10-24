/**
 * Pure finance business rules.
 *
 * These helpers encode the money rules shared by the service layer and are
 * intentionally free of I/O so they can be unit-tested without a database:
 *
 * - overdue derivation (a charge past its due date is overdue even before the
 *   nightly sweep persists the stored status),
 * - installment splitting (whole-cent distribution, no dust lost),
 * - void / cancel guards,
 * - scholarship expiry.
 */

export type ChargeStatusLike =
  | 'PENDING'
  | 'PARTIAL'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

export type PaymentStatusLike = 'POSTED' | 'VOIDED';

export type ScholarshipStatusLike =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

export function startOfTodayUtc(reference: Date = new Date()): Date {
  return new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate(),
    ),
  );
}

/**
 * Display status for a charge. Terminal states (`CANCELLED`, `PAID`) never
 * change; anything past its due date reads as `OVERDUE` even when the stored
 * status is still `PENDING`/`PARTIAL` (the nightly sweep persists it later).
 */
export function deriveChargeStatus(
  current: ChargeStatusLike,
  amountCents: number,
  paidAmountCents: number,
  dueDate: Date,
  today: Date = startOfTodayUtc(),
): ChargeStatusLike {
  if (current === 'CANCELLED') return 'CANCELLED';
  if (paidAmountCents >= amountCents) return 'PAID';
  if (dueDate < today) return 'OVERDUE';
  if (paidAmountCents > 0) return 'PARTIAL';
  return 'PENDING';
}

export function isChargeOverdue(
  status: ChargeStatusLike,
  dueDate: Date,
  today: Date = startOfTodayUtc(),
): boolean {
  if (status === 'CANCELLED' || status === 'PAID') return false;
  return dueDate < today;
}

/**
 * Split a total into whole-cent installments. The remainder cents go to the
 * earliest installments so `sum(result) === totalCents` always holds.
 * Throws when there is not at least one cent per installment.
 */
export function splitInstallmentAmounts(
  totalCents: number,
  count: number,
): number[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('INSTALLMENT_COUNT_INVALID');
  }
  if (!Number.isInteger(totalCents) || totalCents < count) {
    throw new RangeError('INSTALLMENT_AMOUNT_TOO_LOW');
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function canVoidPayment(status: PaymentStatusLike): boolean {
  return status === 'POSTED';
}

export function canCancelCharge(
  status: ChargeStatusLike,
  paidAmountCents: number,
): boolean {
  if (status === 'CANCELLED') return false;
  return paidAmountCents <= 0;
}

export function shouldExpireScholarship(
  status: ScholarshipStatusLike,
  validTo: Date | null,
  today: Date = startOfTodayUtc(),
): boolean {
  if (status !== 'APPROVED') return false;
  if (!validTo) return false;
  return validTo < today;
}

/** A plan is complete only when every live charge is fully paid. */
export function isInstallmentPlanComplete(
  charges: Array<{ status: ChargeStatusLike }>,
): boolean {
  const live = charges.filter((charge) => charge.status !== 'CANCELLED');
  if (live.length === 0) return false;
  return live.every((charge) => charge.status === 'PAID');
}
