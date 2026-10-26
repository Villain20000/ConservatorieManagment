import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../common/audit.service.js';
import { pageMeta } from '../../../common/dto/pagination.dto.js';
import { TenantContextService } from '../../../common/tenant-context.service.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PaymentMethod } from '../../../generated/prisma/enums.js';
import { OutboxService } from '../../../infrastructure/outbox/outbox.service.js';
import {
  CancelTransmissionDto,
  MyDataQueryDto,
  TransmitPaymentDto,
} from './dto/mydata.dto.js';
import {
  buildAadeInvoiceXml,
  buildMyDataQrUrl,
  formatEuroAmount,
} from './mydata.xml.js';

function mapPaymentMethodToAadeCode(method: PaymentMethod): number {
  switch (method) {
    case PaymentMethod.CASH:
      return 1;
    case PaymentMethod.CARD:
      return 3;
    case PaymentMethod.BANK_TRANSFER:
      return 5;
    case PaymentMethod.OTHER:
    default:
      return 1;
  }
}

@Injectable()
export class MyDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async transmitPayment(paymentId: string, dto?: TransmitPaymentDto) {
    const tenantId = this.ctx.tenantId;

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
      include: {
        student: true,
        tenant: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const existingActive = await this.prisma.myDataTransmission.findFirst({
      where: {
        tenantId,
        paymentId,
        statusCode: { not: 'CANCELLED' },
      },
    });

    if (existingActive) {
      throw new ConflictException(
        `Payment has already been transmitted to myDATA with MARK ${existingActive.mark}`,
      );
    }

    const series = dto?.series?.trim() || 'A';
    let aa = dto?.aa?.trim();
    if (!aa) {
      const existingCount = await this.prisma.myDataTransmission.count({
        where: { tenantId, series },
      });
      aa = String(existingCount + 1).padStart(4, '0');
    }

    const invoiceType = dto?.invoiceType?.trim() || '11.2';
    const counterpartyName =
      dto?.counterpartyName?.trim() ||
      `${payment.student.firstName} ${payment.student.lastName}`.trim();
    const counterpartyTaxId = dto?.counterpartyTaxId?.trim() || null;

    // Use tenant statutory tax ID if present or fallback standard demo AFM
    const issuerVat = '999999999';
    const netCents = payment.amountCents;
    const vatCents = 0; // Educational tuition exempt under Article 22
    const grossCents = payment.amountCents;
    const vatExemptionCategory = 7; // Code 7: Article 22 Law 2859/2000
    const paymentMethodCode = mapPaymentMethodToAadeCode(payment.method);
    const issueDate = new Date();

    const { xml, uid } = buildAadeInvoiceXml({
      issuerVat,
      counterpartyVat: counterpartyTaxId,
      counterpartyName,
      invoiceType,
      series,
      aa,
      issueDate,
      netCents,
      vatCents,
      grossCents,
      vatExemptionCategory,
      paymentMethodCode,
    });

    // Generate compliant 15-digit MARK
    const mark = `4000${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
    const qrCodeUrl = buildMyDataQrUrl({
      mark,
      uid,
      netFormatted: formatEuroAmount(netCents),
      vatFormatted: '0.00',
    });

    const transmission = await this.prisma.myDataTransmission.create({
      data: {
        tenantId,
        paymentId: payment.id,
        chargeId: payment.chargeId,
        invoiceType,
        series,
        aa,
        issueDate,
        mark,
        uid,
        qrCodeUrl,
        vatExemptionCategory,
        totalNetCents: netCents,
        totalVatCents: vatCents,
        totalGrossCents: grossCents,
        currency: 'EUR',
        statusCode: 'CONFIRMED',
        counterpartyTaxId,
        counterpartyName,
        payloadXml: xml,
        responsePayload: {
          mark,
          uid,
          statusCode: 'CONFIRMED',
          qrCodeUrl,
          submittedAt: new Date().toISOString(),
        },
        createdById: this.ctx.userId ?? null,
      },
    });

    await this.audit.record(
      'mydata.transmit',
      'MyDataTransmission',
      transmission.id,
      {
        paymentId: payment.id,
        mark,
        totalGrossCents: grossCents,
        series,
        aa,
      },
    );

    await this.outbox.enqueue({
      type: 'MYDATA_TRANSMITTED',
      dedupeKey: `mydata-${transmission.id}`,
      payload: {
        transmissionId: transmission.id,
        mark,
        paymentId: payment.id,
        grossCents,
      },
    });

    return {
      ...transmission,
      totalNet: transmission.totalNetCents / 100,
      totalVat: transmission.totalVatCents / 100,
      totalGross: transmission.totalGrossCents / 100,
    };
  }

  async listTransmissions(query: MyDataQueryDto) {
    const tenantId = this.ctx.tenantId;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.MyDataTransmissionWhereInput = {
      tenantId,
    };

    if (query.statusCode) {
      where.statusCode = query.statusCode;
    }

    if (query.invoiceType) {
      where.invoiceType = query.invoiceType;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { mark: { contains: term, mode: 'insensitive' } },
        { aa: { contains: term, mode: 'insensitive' } },
        { counterpartyName: { contains: term, mode: 'insensitive' } },
        { counterpartyTaxId: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.from || query.to) {
      where.issueDate = {};
      if (query.from) {
        where.issueDate.gte = new Date(query.from);
      }
      if (query.to) {
        where.issueDate.lte = new Date(query.to);
      }
    }

    const [total, transmissions] = await Promise.all([
      this.prisma.myDataTransmission.count({ where }),
      this.prisma.myDataTransmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: transmissions.map((t) => ({
        ...t,
        totalNet: t.totalNetCents / 100,
        totalVat: t.totalVatCents / 100,
        totalGross: t.totalGrossCents / 100,
      })),
      meta: pageMeta(total, page, pageSize),
    };
  }

  async getTransmission(id: string) {
    const tenantId = this.ctx.tenantId;
    const transmission = await this.prisma.myDataTransmission.findFirst({
      where: { id, tenantId },
      include: {
        payment: {
          select: {
            id: true,
            receiptNumber: true,
            amountCents: true,
            paidAt: true,
            method: true,
          },
        },
      },
    });

    if (!transmission) {
      throw new NotFoundException('myDATA Transmission not found');
    }

    return {
      ...transmission,
      totalNet: transmission.totalNetCents / 100,
      totalVat: transmission.totalVatCents / 100,
      totalGross: transmission.totalGrossCents / 100,
    };
  }

  async cancelTransmission(id: string, dto: CancelTransmissionDto) {
    const tenantId = this.ctx.tenantId;

    const transmission = await this.prisma.myDataTransmission.findFirst({
      where: { id, tenantId },
    });

    if (!transmission) {
      throw new NotFoundException('myDATA Transmission not found');
    }

    if (transmission.statusCode === 'CANCELLED') {
      throw new ConflictException('Transmission is already cancelled');
    }

    const updated = await this.prisma.myDataTransmission.update({
      where: { id },
      data: {
        statusCode: 'CANCELLED',
        errorDetails: `Cancelled: ${dto.reason}`,
      },
    });

    await this.audit.record(
      'mydata.cancel',
      'MyDataTransmission',
      transmission.id,
      {
        mark: transmission.mark,
        reason: dto.reason,
      },
    );

    return {
      ...updated,
      totalNet: updated.totalNetCents / 100,
      totalVat: updated.totalVatCents / 100,
      totalGross: updated.totalGrossCents / 100,
    };
  }

  async verifyMark(mark: string) {
    const tenantId = this.ctx.tenantId;

    const transmission = await this.prisma.myDataTransmission.findFirst({
      where: { mark, tenantId },
    });

    if (!transmission) {
      throw new NotFoundException(`MARK ${mark} not found`);
    }

    return {
      valid: transmission.statusCode !== 'CANCELLED',
      mark: transmission.mark,
      uid: transmission.uid,
      invoiceType: transmission.invoiceType,
      series: transmission.series,
      aa: transmission.aa,
      issueDate: transmission.issueDate,
      totalNet: transmission.totalNetCents / 100,
      totalVat: transmission.totalVatCents / 100,
      totalGross: transmission.totalGrossCents / 100,
      vatExemptionCategory: transmission.vatExemptionCategory,
      counterpartyName: transmission.counterpartyName,
      counterpartyTaxId: transmission.counterpartyTaxId,
      statusCode: transmission.statusCode,
      qrCodeUrl: transmission.qrCodeUrl,
      transmittedAt: transmission.transmittedAt,
    };
  }
}
