import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../../common/audit.service.js';
import { TenantContextService } from '../../../common/tenant-context.service.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { OutboxService } from '../../../infrastructure/outbox/outbox.service.js';
import { SignaturesService } from './signatures.service.js';

describe('Electronic Signatures (eIDAS / Gov.gr) Service', () => {
  let service: SignaturesService;
  let prisma: any;
  let ctx: any;
  let audit: any;
  let outbox: any;

  const tenantId = '00000000-0000-7000-0000-000000000001';
  const documentId = '00000000-0000-7000-0000-000000000050';

  beforeEach(() => {
    prisma = {
      documentRecord: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      electronicSignatureRequest: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    ctx = { tenantId };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    outbox = { enqueue: vi.fn().mockResolvedValue(undefined) };

    service = new SignaturesService(
      prisma as unknown as PrismaService,
      ctx as unknown as TenantContextService,
      audit as unknown as AuditService,
      outbox as unknown as OutboxService,
    );
  });

  describe('createSignatureRequest', () => {
    it('throws NotFoundException if document not found', async () => {
      prisma.documentRecord.findFirst.mockResolvedValue(null);

      await expect(
        service.createSignatureRequest({
          documentId,
          signerName: 'Kostas Karamanlis',
          signerEmail: 'kostas@example.com',
          signerRole: 'GUARDIAN',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates envelope, updates document status, audits and enqueues outbox event', async () => {
      prisma.documentRecord.findFirst.mockResolvedValue({
        id: documentId,
        tenantId,
        title: 'Enrollment Agreement 2026-2027',
      });
      prisma.electronicSignatureRequest.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'sig-1' }),
      );

      const result = await service.createSignatureRequest({
        documentId,
        signerName: 'Eleni Vakalo',
        signerEmail: 'eleni@example.com',
        signerRole: 'STUDENT',
        provider: 'GOV_GR',
      });

      expect(result.id).toBe('sig-1');
      expect(result.status).toBe('PENDING');
      expect(result.provider).toBe('GOV_GR');
      expect(result.signingPortalUrl).toContain('/portal/signatures/');

      expect(prisma.documentRecord.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: { signatureStatus: 'PENDING' },
      });

      expect(audit.record).toHaveBeenCalledWith(
        'signatures.request_created',
        'ElectronicSignatureRequest',
        'sig-1',
        expect.any(Object),
      );

      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DOCUMENT_SIGNATURE_REQUESTED',
        }),
      );
    });
  });

  describe('verifyAndSign', () => {
    it('verifies token, produces SHA-256 seal, marks signed and enqueues outbox event', async () => {
      prisma.electronicSignatureRequest.findFirst.mockResolvedValue({
        id: 'sig-1',
        documentId,
        signerName: 'Nikos Kazantzakis',
        signerEmail: 'nikos@example.com',
        signerRole: 'GUARDIAN',
        provider: 'INTERNAL_EIDAS',
        status: 'PENDING',
      });
      prisma.electronicSignatureRequest.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'sig-1', ...data }),
      );

      const signed = await service.verifyAndSign('valid-token-123', {}, '192.168.1.100');

      expect(signed.status).toBe('SIGNED');
      expect(signed.certificateHash).toHaveLength(64);
      expect(signed.auditTrail.eidasStandard).toContain('PAdES-B-LT');

      expect(prisma.documentRecord.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: { signatureStatus: 'SIGNED' },
      });

      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DOCUMENT_SIGNED',
        }),
      );
    });

    it('throws ConflictException if already signed', async () => {
      prisma.electronicSignatureRequest.findFirst.mockResolvedValue({
        id: 'sig-1',
        status: 'SIGNED',
      });

      await expect(service.verifyAndSign('already-signed-token')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
