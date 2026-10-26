import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../../common/audit.service.js';
import { TenantContextService } from '../../../common/tenant-context.service.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { PaymentMethod, PaymentStatus } from '../../../generated/prisma/enums.js';
import { OutboxService } from '../../../infrastructure/outbox/outbox.service.js';
import { MyDataService } from './mydata.service.js';
import {
  buildAadeInvoiceXml,
  buildMyDataQrUrl,
  computeMyDataUid,
  formatEuroAmount,
} from './mydata.xml.js';

describe('AADE myDATA Greek E-Invoicing Engine', () => {
  describe('XML & Digest Generation', () => {
    it('formats euro cents to decimal string correctly', () => {
      expect(formatEuroAmount(12000)).toBe('120.00');
      expect(formatEuroAmount(50)).toBe('0.50');
      expect(formatEuroAmount(0)).toBe('0.00');
    });

    it('computes deterministic SHA-1 UID fingerprint', () => {
      const uid1 = computeMyDataUid({
        issuerVat: '999999999',
        issueDateIso: '2026-10-25',
        branch: 0,
        invoiceType: '11.2',
        series: 'A',
        aa: '0001',
      });
      const uid2 = computeMyDataUid({
        issuerVat: '999999999',
        issueDateIso: '2026-10-25',
        branch: 0,
        invoiceType: '11.2',
        series: 'A',
        aa: '0001',
      });
      expect(uid1).toBe(uid2);
      expect(uid1).toHaveLength(40);
    });

    it('generates valid AADE XML with Law 2859/2000 Article 22 VAT Exemption code 7', () => {
      const { xml, uid } = buildAadeInvoiceXml({
        issuerVat: '094123456',
        counterpartyVat: '123456789',
        counterpartyName: 'Nikolaos Papadopoulos',
        invoiceType: '11.2',
        series: 'A',
        aa: '0042',
        issueDate: new Date('2026-10-25T10:00:00Z'),
        netCents: 15000,
        vatCents: 0,
        grossCents: 15000,
        vatExemptionCategory: 7,
        paymentMethodCode: 3,
      });

      expect(xml).toContain('<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"');
      expect(xml).toContain(`<uid>${uid}</uid>`);
      expect(xml).toContain('<vatNumber>094123456</vatNumber>');
      expect(xml).toContain('<vatNumber>123456789</vatNumber>');
      expect(xml).toContain('<name>Nikolaos Papadopoulos</name>');
      expect(xml).toContain('<invoiceType>11.2</invoiceType>');
      expect(xml).toContain('<vatCategory>8</vatCategory>');
      expect(xml).toContain('<vatExemptionCategory>7</vatExemptionCategory>');
      expect(xml).toContain('<netValue>150.00</netValue>');
      expect(xml).toContain('<vatAmount>0.00</vatAmount>');
      expect(xml).toContain('<grossValue>150.00</grossValue>');
      expect(xml).toContain('<classificationType>E3_561_003</classificationType>');
    });

    it('generates official AADE QR verification URL', () => {
      const qr = buildMyDataQrUrl({
        mark: '400012345678901',
        uid: 'AABBCCDDEEFF00112233',
        netFormatted: '150.00',
        vatFormatted: '0.00',
      });
      expect(qr).toBe('https://www.aade.gr/mydata/qr?mark=400012345678901&uid=AABBCCDDEEFF00112233&net=150.00&vat=0.00');
    });
  });

  describe('MyDataService', () => {
    let service: MyDataService;
    let prisma: any;
    let ctx: any;
    let audit: any;
    let outbox: any;

    const tenantId = '00000000-0000-7000-0000-000000000001';
    const userId = '00000000-0000-7000-0000-000000000099';
    const paymentId = '00000000-0000-7000-0000-000000000100';

    beforeEach(() => {
      prisma = {
        payment: {
          findFirst: vi.fn(),
        },
        myDataTransmission: {
          findFirst: vi.fn(),
          count: vi.fn(),
          create: vi.fn(),
          findMany: vi.fn(),
          update: vi.fn(),
        },
      };
      ctx = {
        tenantId,
        userId,
      };
      audit = {
        record: vi.fn(),
      };
      outbox = {
        enqueue: vi.fn().mockResolvedValue(undefined),
      };

      service = new MyDataService(
        prisma as unknown as PrismaService,
        ctx as unknown as TenantContextService,
        audit as unknown as AuditService,
        outbox as unknown as OutboxService,
      );
    });

    it('throws NotFoundException when transmitting payment of another tenant (probe-resistant)', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.transmitPayment(paymentId)).rejects.toThrow(NotFoundException);
      expect(prisma.payment.findFirst).toHaveBeenCalledWith({
        where: { id: paymentId, tenantId },
        include: { student: true, tenant: true },
      });
    });

    it('throws ConflictException when payment has already been transmitted', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        tenantId,
        amountCents: 10000,
        method: PaymentMethod.CARD,
        student: { firstName: 'Maria', lastName: 'Kallas' },
      });
      prisma.myDataTransmission.findFirst.mockResolvedValue({
        id: 'tx-1',
        mark: '400099999999999',
        statusCode: 'CONFIRMED',
      });

      await expect(service.transmitPayment(paymentId)).rejects.toThrow(ConflictException);
    });

    it('transmits payment, creates transmission record, records audit and enqueues outbox event', async () => {
      const mockPayment = {
        id: paymentId,
        tenantId,
        chargeId: 'charge-1',
        receiptNumber: 'REC-2026-001',
        amountCents: 8500,
        method: PaymentMethod.BANK_TRANSFER,
        status: PaymentStatus.POSTED,
        student: {
          firstName: 'Dimitrios',
          lastName: 'Mitropoulos',
        },
      };

      prisma.payment.findFirst.mockResolvedValue(mockPayment);
      prisma.myDataTransmission.findFirst.mockResolvedValue(null);
      prisma.myDataTransmission.count.mockResolvedValue(12);
      prisma.myDataTransmission.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          ...data,
          id: 'trans-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.transmitPayment(paymentId, {
        series: 'A',
      });

      expect(result.id).toBe('trans-123');
      expect(result.series).toBe('A');
      expect(result.aa).toBe('0013');
      expect(result.totalGross).toBe(85.0);
      expect(result.totalNet).toBe(85.0);
      expect(result.totalVat).toBe(0.0);
      expect(result.vatExemptionCategory).toBe(7);
      expect(result.statusCode).toBe('CONFIRMED');
      expect(result.mark).toMatch(/^4000/);
      expect(result.qrCodeUrl).toContain('https://www.aade.gr/mydata/qr');
      expect(result.counterpartyName).toBe('Dimitrios Mitropoulos');

      expect(audit.record).toHaveBeenCalledWith(
        'mydata.transmit',
        'MyDataTransmission',
        'trans-123',
        expect.objectContaining({
          paymentId,
          totalGrossCents: 8500,
          series: 'A',
          aa: '0013',
        }),
      );

      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'MYDATA_TRANSMITTED',
          dedupeKey: 'mydata-trans-123',
        }),
      );
    });

    it('cancels transmission and records audit', async () => {
      prisma.myDataTransmission.findFirst.mockResolvedValue({
        id: 'trans-1',
        tenantId,
        statusCode: 'CONFIRMED',
        totalNetCents: 8000,
        totalVatCents: 0,
        totalGrossCents: 8000,
        mark: '400011111111111',
      });
      prisma.myDataTransmission.update.mockResolvedValue({
        id: 'trans-1',
        tenantId,
        statusCode: 'CANCELLED',
        totalNetCents: 8000,
        totalVatCents: 0,
        totalGrossCents: 8000,
        mark: '400011111111111',
      });

      const res = await service.cancelTransmission('trans-1', {
        reason: 'Issued by mistake',
      });

      expect(res.statusCode).toBe('CANCELLED');
      expect(audit.record).toHaveBeenCalledWith(
        'mydata.cancel',
        'MyDataTransmission',
        'trans-1',
        {
          mark: '400011111111111',
          reason: 'Issued by mistake',
        },
      );
    });

    it('verifies valid MARK correctly', async () => {
      prisma.myDataTransmission.findFirst.mockResolvedValue({
        mark: '400012345678901',
        uid: 'UID123',
        invoiceType: '11.2',
        series: 'A',
        aa: '0001',
        issueDate: new Date('2026-10-25'),
        totalNetCents: 10000,
        totalVatCents: 0,
        totalGrossCents: 10000,
        vatExemptionCategory: 7,
        counterpartyName: 'Nikos Skalkottas',
        statusCode: 'CONFIRMED',
        qrCodeUrl: 'https://www.aade.gr/mydata/qr?...',
        transmittedAt: new Date(),
      });

      const verified = await service.verifyMark('400012345678901');
      expect(verified.valid).toBe(true);
      expect(verified.totalGross).toBe(100.0);
      expect(verified.counterpartyName).toBe('Nikos Skalkottas');
    });
  });
});
