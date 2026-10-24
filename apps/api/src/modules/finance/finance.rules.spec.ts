import { describe, expect, it } from 'vitest';
import {
  canCancelCharge,
  canVoidPayment,
  deriveChargeStatus,
  isChargeOverdue,
  isInstallmentPlanComplete,
  shouldExpireScholarship,
  splitInstallmentAmounts,
  startOfTodayUtc,
} from './finance.rules.js';

const TODAY = new Date(Date.UTC(2026, 9, 24));
const PAST = new Date(Date.UTC(2026, 9, 1));
const FUTURE = new Date(Date.UTC(2026, 10, 30));

describe('overdue derivation', () => {
  it('marks past-due unpaid charges overdue regardless of stored status', () => {
    expect(deriveChargeStatus('PENDING', 10000, 0, PAST, TODAY)).toBe('OVERDUE');
    expect(deriveChargeStatus('PARTIAL', 10000, 4000, PAST, TODAY)).toBe('OVERDUE');
  });

  it('keeps future charges pending or partial', () => {
    expect(deriveChargeStatus('PENDING', 10000, 0, FUTURE, TODAY)).toBe('PENDING');
    expect(deriveChargeStatus('PARTIAL', 10000, 4000, FUTURE, TODAY)).toBe('PARTIAL');
  });

  it('treats terminal states as final', () => {
    expect(deriveChargeStatus('CANCELLED', 10000, 0, PAST, TODAY)).toBe('CANCELLED');
    expect(deriveChargeStatus('PENDING', 10000, 10000, PAST, TODAY)).toBe('PAID');
    expect(deriveChargeStatus('OVERDUE', 10000, 10000, PAST, TODAY)).toBe('PAID');
  });

  it('recovers to pending/partial when the due date moves back to the future', () => {
    expect(deriveChargeStatus('OVERDUE', 10000, 0, FUTURE, TODAY)).toBe('PENDING');
    expect(deriveChargeStatus('OVERDUE', 10000, 2500, FUTURE, TODAY)).toBe('PARTIAL');
  });

  it('isChargeOverdue ignores cancelled and paid charges', () => {
    expect(isChargeOverdue('PENDING', PAST, TODAY)).toBe(true);
    expect(isChargeOverdue('PENDING', FUTURE, TODAY)).toBe(false);
    expect(isChargeOverdue('CANCELLED', PAST, TODAY)).toBe(false);
    expect(isChargeOverdue('PAID', PAST, TODAY)).toBe(false);
  });

  it('startOfTodayUtc truncates to midnight UTC', () => {
    const at = startOfTodayUtc(new Date(Date.UTC(2026, 9, 24, 15, 30)));
    expect(at).toEqual(new Date(Date.UTC(2026, 9, 24)));
  });
});

describe('installment splitting', () => {
  it('distributes whole cents with the remainder first and no dust lost', () => {
    const parts = splitInstallmentAmounts(10000, 3);
    expect(parts).toEqual([3334, 3333, 3333]);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(10000);
  });

  it('splits evenly when divisible', () => {
    expect(splitInstallmentAmounts(9000, 3)).toEqual([3000, 3000, 3000]);
  });

  it('rejects totals below one cent per installment', () => {
    expect(() => splitInstallmentAmounts(2, 3)).toThrowError('INSTALLMENT_AMOUNT_TOO_LOW');
    expect(() => splitInstallmentAmounts(0, 3)).toThrowError('INSTALLMENT_AMOUNT_TOO_LOW');
  });

  it('rejects invalid counts', () => {
    expect(() => splitInstallmentAmounts(100, 0)).toThrowError('INSTALLMENT_COUNT_INVALID');
  });

  it('completes a plan only when every live charge is paid', () => {
    expect(isInstallmentPlanComplete([])).toBe(false);
    expect(
      isInstallmentPlanComplete([{ status: 'PAID' }, { status: 'PAID' }]),
    ).toBe(true);
    expect(
      isInstallmentPlanComplete([{ status: 'PAID' }, { status: 'PARTIAL' }]),
    ).toBe(false);
    expect(
      isInstallmentPlanComplete([{ status: 'PAID' }, { status: 'CANCELLED' }]),
    ).toBe(true);
    expect(isInstallmentPlanComplete([{ status: 'CANCELLED' }])).toBe(false);
  });
});

describe('void and cancel guards', () => {
  it('allows voiding posted payments only', () => {
    expect(canVoidPayment('POSTED')).toBe(true);
    expect(canVoidPayment('VOIDED')).toBe(false);
  });

  it('blocks cancelling charges that hold money', () => {
    expect(canCancelCharge('PENDING', 0)).toBe(true);
    expect(canCancelCharge('PENDING', 100)).toBe(false);
    expect(canCancelCharge('CANCELLED', 0)).toBe(false);
  });
});

describe('scholarship expiry', () => {
  it('expires approved scholarships past their validity', () => {
    expect(shouldExpireScholarship('APPROVED', PAST, TODAY)).toBe(true);
    expect(shouldExpireScholarship('APPROVED', FUTURE, TODAY)).toBe(false);
    expect(shouldExpireScholarship('APPROVED', null, TODAY)).toBe(false);
    expect(shouldExpireScholarship('PENDING', PAST, TODAY)).toBe(false);
    expect(shouldExpireScholarship('REJECTED', PAST, TODAY)).toBe(false);
  });
});
