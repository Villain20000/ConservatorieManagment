import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../common/audit.service.js';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  SubscriptionInvoiceStatus,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
  TenantStatus,
} from '../../generated/prisma/enums.js';
import {
  BillingWebhookDto,
  PaySubscriptionInvoiceDto,
  SimulatePaymentFailureDto,
  SubscriptionInvoiceQueryDto,
} from './dto/subscription-billing.dto.js';

@Injectable()
export class SubscriptionBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async generateBillingCycle() {
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      },
      include: {
        plan: true,
        tenant: true,
        invoices: {
          orderBy: { periodStart: 'desc' },
          take: 1,
        },
      },
    });

    const now = new Date();
    const currentYear = now.getFullYear();
    const createdInvoices = [];

    for (const subscription of subscriptions) {
      const periodStart = subscription.currentPeriodEnd ?? subscription.createdAt;
      const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Check if invoice already exists for this subscription and periodStart
      const existing = await this.prisma.subscriptionInvoice.findFirst({
        where: {
          subscriptionId: subscription.id,
          periodStart,
        },
      });

      if (existing) {
        continue;
      }

      const totalExistingCount = await this.prisma.subscriptionInvoice.count();
      const invoiceNumber = `INV-${currentYear}-${String(totalExistingCount + 1).padStart(5, '0')}`;
      const subtotalCents = Math.round(Number(subscription.plan.priceMonthly) * 100);
      const taxCents = 0; // SaaS platform direct B2B billing
      const totalCents = subtotalCents + taxCents;
      const dueAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14-day terms

      const invoice = await this.prisma.subscriptionInvoice.create({
        data: {
          subscriptionId: subscription.id,
          externalId: `ext_inv_${randomUUID()}`,
          number: invoiceNumber,
          periodStart,
          periodEnd,
          subtotalCents,
          taxCents,
          totalCents,
          currency: 'EUR',
          status: SubscriptionInvoiceStatus.OPEN,
          dueAt,
        },
      });

      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodEnd: periodEnd,
        },
      });

      await this.audit.record(
        'subscription_billing.invoice_generated',
        'SubscriptionInvoice',
        invoice.id,
        {
          tenantId: subscription.tenantId,
          number: invoice.number,
          totalCents: invoice.totalCents,
        },
      );

      createdInvoices.push(invoice);
    }

    return {
      generatedCount: createdInvoices.length,
      invoices: createdInvoices.map((inv) => ({
        ...inv,
        subtotal: inv.subtotalCents / 100,
        tax: inv.taxCents / 100,
        total: inv.totalCents / 100,
      })),
    };
  }

  async payInvoice(invoiceId: string, dto?: PaySubscriptionInvoiceDto) {
    const invoice = await this.prisma.subscriptionInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        subscription: {
          include: { tenant: true },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Subscription invoice not found');
    }

    if (invoice.status === SubscriptionInvoiceStatus.PAID) {
      throw new ConflictException('Subscription invoice is already paid');
    }

    const externalId = dto?.externalTransactionId || `pay_${randomUUID()}`;
    const method = dto?.paymentMethod || 'CARD';

    const payment = await this.prisma.subscriptionPayment.create({
      data: {
        invoiceId: invoice.id,
        externalId,
        amountCents: invoice.totalCents,
        currency: invoice.currency,
        status: SubscriptionPaymentStatus.SUCCEED,
        method,
      },
    });

    const updatedInvoice = await this.prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        status: SubscriptionInvoiceStatus.PAID,
        paidAt: new Date(),
      },
    });

    // If subscription was past due, reactivate it
    if (invoice.subscription.status === SubscriptionStatus.PAST_DUE) {
      await this.prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: { status: SubscriptionStatus.ACTIVE },
      });
    }

    // If tenant was suspended due to billing, reactivate
    if (invoice.subscription.tenant.status === TenantStatus.SUSPENDED) {
      await this.prisma.tenant.update({
        where: { id: invoice.subscription.tenantId },
        data: { status: TenantStatus.ACTIVE },
      });
    }

    await this.audit.record(
      'subscription_billing.invoice_paid',
      'SubscriptionInvoice',
      invoice.id,
      {
        tenantId: invoice.subscription.tenantId,
        paymentId: payment.id,
        amountCents: invoice.totalCents,
      },
    );

    return {
      ...updatedInvoice,
      subtotal: updatedInvoice.subtotalCents / 100,
      tax: updatedInvoice.taxCents / 100,
      total: updatedInvoice.totalCents / 100,
      payment,
    };
  }

  async recordPaymentFailure(invoiceId: string, dto: SimulatePaymentFailureDto) {
    const invoice = await this.prisma.subscriptionInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        subscription: {
          include: { tenant: true },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Subscription invoice not found');
    }

    const externalId = `pay_fail_${randomUUID()}`;

    const payment = await this.prisma.subscriptionPayment.create({
      data: {
        invoiceId: invoice.id,
        externalId,
        amountCents: invoice.totalCents,
        currency: invoice.currency,
        status: SubscriptionPaymentStatus.FAILED,
        failureCode: dto.failureCode,
      },
    });

    // Mark subscription PAST_DUE
    await this.prisma.subscription.update({
      where: { id: invoice.subscriptionId },
      data: { status: SubscriptionStatus.PAST_DUE },
    });

    // Dunning policy: If invoice is already overdue or explicitly uncollectible, suspend tenant
    const isOverdue = invoice.dueAt && invoice.dueAt.getTime() < Date.now();
    let tenantSuspended = false;

    if (isOverdue) {
      await this.prisma.tenant.update({
        where: { id: invoice.subscription.tenantId },
        data: { status: TenantStatus.SUSPENDED },
      });
      tenantSuspended = true;
    }

    await this.audit.record(
      'subscription_billing.payment_failed',
      'SubscriptionInvoice',
      invoice.id,
      {
        tenantId: invoice.subscription.tenantId,
        failureCode: dto.failureCode,
        tenantSuspended,
      },
    );

    return {
      invoiceId: invoice.id,
      paymentId: payment.id,
      subscriptionStatus: SubscriptionStatus.PAST_DUE,
      tenantSuspended,
      failureCode: dto.failureCode,
    };
  }

  async processWebhook(dto: BillingWebhookDto) {
    const invoice = await this.prisma.subscriptionInvoice.findUnique({
      where: { externalId: dto.invoiceExternalId },
    });

    if (!invoice) {
      throw new NotFoundException(
        `Invoice with externalId ${dto.invoiceExternalId} not found`,
      );
    }

    if (dto.eventType === 'invoice.payment_succeeded') {
      return this.payInvoice(invoice.id, {
        externalTransactionId: dto.eventId,
      });
    }

    if (dto.eventType === 'invoice.payment_failed') {
      return this.recordPaymentFailure(invoice.id, {
        failureCode: dto.failureCode || 'GATEWAY_ERROR',
      });
    }

    return { received: true, eventId: dto.eventId };
  }

  async listInvoices(query: SubscriptionInvoiceQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.SubscriptionInvoiceWhereInput = {};

    if (query.tenantId) {
      where.subscription = { tenantId: query.tenantId };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { number: { contains: term, mode: 'insensitive' } },
        { externalId: { contains: term, mode: 'insensitive' } },
        { subscription: { tenant: { name: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const [total, invoices] = await Promise.all([
      this.prisma.subscriptionInvoice.count({ where }),
      this.prisma.subscriptionInvoice.findMany({
        where,
        include: {
          subscription: {
            include: {
              tenant: { select: { id: true, name: true, status: true } },
              plan: { select: { id: true, name: true, code: true } },
            },
          },
          payments: {
            orderBy: { attemptedAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: invoices.map((inv) => ({
        ...inv,
        subtotal: inv.subtotalCents / 100,
        tax: inv.taxCents / 100,
        total: inv.totalCents / 100,
      })),
      meta: pageMeta(total, page, pageSize),
    };
  }

  async getBillingMetrics() {
    const [subscriptions, invoices, pastDueCount] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
        include: { plan: true },
      }),
      this.prisma.subscriptionInvoice.findMany({
        select: {
          id: true,
          status: true,
          subtotalCents: true,
          totalCents: true,
          dueAt: true,
        },
      }),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.PAST_DUE },
      }),
    ]);

    const mrrCents = subscriptions.reduce(
      (sum, s) => sum + Math.round(Number(s.plan.priceMonthly) * 100),
      0,
    );
    const arrCents = mrrCents * 12;

    let totalInvoicedCents = 0;
    let totalCollectedCents = 0;
    let totalOverdueCents = 0;
    let paidCount = 0;
    let openCount = 0;
    const now = Date.now();

    for (const inv of invoices) {
      totalInvoicedCents += inv.totalCents;
      if (inv.status === SubscriptionInvoiceStatus.PAID) {
        totalCollectedCents += inv.totalCents;
        paidCount++;
      } else if (inv.status === SubscriptionInvoiceStatus.OPEN) {
        openCount++;
        if (inv.dueAt && inv.dueAt.getTime() < now) {
          totalOverdueCents += inv.totalCents;
        }
      }
    }

    return {
      mrr: mrrCents / 100,
      arr: arrCents / 100,
      totalInvoiced: totalInvoicedCents / 100,
      totalCollected: totalCollectedCents / 100,
      totalOverdue: totalOverdueCents / 100,
      paidInvoicesCount: paidCount,
      openInvoicesCount: openCount,
      pastDueSubscriptionsCount: pastDueCount,
      activeSubscriptionsCount: subscriptions.length,
    };
  }
}
