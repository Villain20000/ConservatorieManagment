import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../common/audit.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  SubscriptionInvoiceStatus,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
  TenantStatus,
} from '../../generated/prisma/enums.js';
import { SubscriptionBillingService } from './subscription-billing.service.js';

describe('SaaS Commercial Billing Engine', () => {
  let service: SubscriptionBillingService;
  let prisma: any;
  let audit: any;

  const tenantId = '00000000-0000-7000-0000-000000000001';
  const subscriptionId = '00000000-0000-7000-0000-000000000010';
  const invoiceId = '00000000-0000-7000-0000-000000000020';

  beforeEach(() => {
    prisma = {
      subscription: {
        findMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      subscriptionInvoice: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      subscriptionPayment: {
        create: vi.fn(),
      },
      tenant: {
        update: vi.fn(),
      },
    };

    audit = {
      record: vi.fn(),
    };

    service = new SubscriptionBillingService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('generateBillingCycle', () => {
    it('generates sequential invoices for active subscriptions with correct monthly pricing', async () => {
      const now = new Date();
      prisma.subscription.findMany.mockResolvedValue([
        {
          id: subscriptionId,
          tenantId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: now,
          plan: {
            id: 'plan-pro',
            name: 'Pro Conservatory',
            priceMonthly: 149.0, // EUR 149/mo -> 14900 cents
          },
          tenant: { id: tenantId, name: 'Armonia Conservatory' },
        },
      ]);
      prisma.subscriptionInvoice.findFirst.mockResolvedValue(null);
      prisma.subscriptionInvoice.count.mockResolvedValue(5);
      prisma.subscriptionInvoice.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          ...data,
          id: invoiceId,
        }),
      );

      const result = await service.generateBillingCycle();

      expect(result.generatedCount).toBe(1);
      expect(result.invoices[0].number).toBe(`INV-${now.getFullYear()}-00006`);
      expect(result.invoices[0].totalCents).toBe(14900);
      expect(result.invoices[0].total).toBe(149.0);
      expect(result.invoices[0].status).toBe(SubscriptionInvoiceStatus.OPEN);

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: subscriptionId },
        }),
      );

      expect(audit.record).toHaveBeenCalledWith(
        'subscription_billing.invoice_generated',
        'SubscriptionInvoice',
        invoiceId,
        expect.objectContaining({
          tenantId,
          number: `INV-${now.getFullYear()}-00006`,
          totalCents: 14900,
        }),
      );
    });

    it('skips generating invoice if one already exists for this subscription period', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        {
          id: subscriptionId,
          tenantId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: new Date('2026-11-01'),
          plan: { priceMonthly: 99.0 },
          tenant: { id: tenantId },
        },
      ]);
      prisma.subscriptionInvoice.findFirst.mockResolvedValue({ id: 'existing-inv' });

      const result = await service.generateBillingCycle();
      expect(result.generatedCount).toBe(0);
      expect(prisma.subscriptionInvoice.create).not.toHaveBeenCalled();
    });
  });

  describe('payInvoice', () => {
    it('throws NotFoundException when invoice does not exist', async () => {
      prisma.subscriptionInvoice.findUnique.mockResolvedValue(null);
      await expect(service.payInvoice('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when invoice is already paid', async () => {
      prisma.subscriptionInvoice.findUnique.mockResolvedValue({
        id: invoiceId,
        status: SubscriptionInvoiceStatus.PAID,
        subscription: { tenant: {} },
      });
      await expect(service.payInvoice(invoiceId)).rejects.toThrow(ConflictException);
    });

    it('records successful payment, marks invoice PAID, and reactivates suspended tenant', async () => {
      prisma.subscriptionInvoice.findUnique.mockResolvedValue({
        id: invoiceId,
        subscriptionId,
        totalCents: 14900,
        currency: 'EUR',
        status: SubscriptionInvoiceStatus.OPEN,
        subscription: {
          id: subscriptionId,
          tenantId,
          status: SubscriptionStatus.PAST_DUE,
          tenant: {
            id: tenantId,
            status: TenantStatus.SUSPENDED,
          },
        },
      });

      prisma.subscriptionPayment.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'pay-1' }),
      );
      prisma.subscriptionInvoice.update.mockResolvedValue({
        id: invoiceId,
        totalCents: 14900,
        subtotalCents: 14900,
        taxCents: 0,
        status: SubscriptionInvoiceStatus.PAID,
      });

      const result = await service.payInvoice(invoiceId, { paymentMethod: 'CARD' });

      expect(result.status).toBe(SubscriptionInvoiceStatus.PAID);
      expect(prisma.subscriptionPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          invoiceId,
          amountCents: 14900,
          status: SubscriptionPaymentStatus.SUCCEED,
          method: 'CARD',
        }),
      });

      // Subscription reactivated
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.ACTIVE },
      });

      // Tenant reactivated from SUSPENDED to ACTIVE
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: tenantId },
        data: { status: TenantStatus.ACTIVE },
      });

      expect(audit.record).toHaveBeenCalledWith(
        'subscription_billing.invoice_paid',
        'SubscriptionInvoice',
        invoiceId,
        expect.objectContaining({
          tenantId,
          amountCents: 14900,
        }),
      );
    });
  });

  describe('recordPaymentFailure (Dunning Engine)', () => {
    it('records failed payment and transitions subscription to PAST_DUE', async () => {
      prisma.subscriptionInvoice.findUnique.mockResolvedValue({
        id: invoiceId,
        subscriptionId,
        totalCents: 14900,
        currency: 'EUR',
        dueAt: new Date(Date.now() + 86400000), // not yet overdue
        subscription: {
          id: subscriptionId,
          tenantId,
          status: SubscriptionStatus.ACTIVE,
          tenant: { id: tenantId, status: TenantStatus.ACTIVE },
        },
      });
      prisma.subscriptionPayment.create.mockResolvedValue({ id: 'fail-1' });

      const res = await service.recordPaymentFailure(invoiceId, {
        failureCode: 'CARD_DECLINED',
      });

      expect(res.subscriptionStatus).toBe(SubscriptionStatus.PAST_DUE);
      expect(res.tenantSuspended).toBe(false);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.PAST_DUE },
      });
    });

    it('suspends tenant when payment fails on an overdue invoice', async () => {
      prisma.subscriptionInvoice.findUnique.mockResolvedValue({
        id: invoiceId,
        subscriptionId,
        totalCents: 14900,
        currency: 'EUR',
        dueAt: new Date(Date.now() - 86400000 * 5), // overdue by 5 days
        subscription: {
          id: subscriptionId,
          tenantId,
          status: SubscriptionStatus.PAST_DUE,
          tenant: { id: tenantId, status: TenantStatus.ACTIVE },
        },
      });
      prisma.subscriptionPayment.create.mockResolvedValue({ id: 'fail-2' });

      const res = await service.recordPaymentFailure(invoiceId, {
        failureCode: 'INSUFFICIENT_FUNDS',
      });

      expect(res.tenantSuspended).toBe(true);
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: tenantId },
        data: { status: TenantStatus.SUSPENDED },
      });
    });
  });

  describe('getBillingMetrics', () => {
    it('aggregates MRR, ARR, invoiced, collected, and overdue metrics', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        { plan: { priceMonthly: 100 } },
        { plan: { priceMonthly: 200 } },
      ]);
      prisma.subscriptionInvoice.findMany.mockResolvedValue([
        {
          id: '1',
          status: SubscriptionInvoiceStatus.PAID,
          subtotalCents: 10000,
          totalCents: 10000,
          dueAt: new Date(),
        },
        {
          id: '2',
          status: SubscriptionInvoiceStatus.OPEN,
          subtotalCents: 20000,
          totalCents: 20000,
          dueAt: new Date(Date.now() - 100000), // overdue
        },
      ]);
      prisma.subscription.count.mockResolvedValue(1);

      const metrics = await service.getBillingMetrics();

      expect(metrics.mrr).toBe(300);
      expect(metrics.arr).toBe(3600);
      expect(metrics.totalInvoiced).toBe(300);
      expect(metrics.totalCollected).toBe(100);
      expect(metrics.totalOverdue).toBe(200);
      expect(metrics.paidInvoicesCount).toBe(1);
      expect(metrics.openInvoicesCount).toBe(1);
      expect(metrics.pastDueSubscriptionsCount).toBe(1);
    });
  });
});
