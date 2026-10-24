/**
 * Fiscal / payment provider stubs — INTENTIONALLY UNWIRED.
 *
 * Greek myDATA e-invoicing and card-gateway integrations are out of scope:
 * receipts stay internal PDFs (see `FinanceService.paymentReceipt`). These
 * interfaces pin the seam a future provider would implement; nothing imports
 * the no-op implementations and they are NOT registered in `FinanceModule`.
 */

export interface FiscalSubmission {
  receiptNumber: string;
  amountCents: number;
  issuedAt: Date;
}

export interface FiscalProvider {
  readonly name: string;
  submit(submission: FiscalSubmission): Promise<{ externalId: string }>;
  void(externalId: string, reason: string): Promise<void>;
}

export interface PaymentGatewayCharge {
  amountCents: number;
  currency: 'EUR';
  reference: string;
}

export interface PaymentGateway {
  readonly name: string;
  charge(request: PaymentGatewayCharge): Promise<{ transactionId: string }>;
}

/** Placeholder that performs no external call. Do not provide it anywhere. */
export class NoopFiscalProvider implements FiscalProvider {
  readonly name = 'noop-fiscal (unwired)';
  async submit(): Promise<{ externalId: string }> {
    throw new Error('Fiscal provider is not wired: receipts stay internal PDFs');
  }
  async void(): Promise<void> {
    throw new Error('Fiscal provider is not wired: receipts stay internal PDFs');
  }
}

/** Placeholder that performs no external call. Do not provide it anywhere. */
export class NoopPaymentGateway implements PaymentGateway {
  readonly name = 'noop-gateway (unwired)';
  async charge(): Promise<{ transactionId: string }> {
    throw new Error('Payment gateway is not wired: payments are recorded manually');
  }
}
