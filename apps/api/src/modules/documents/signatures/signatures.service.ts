import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../../../common/audit.service.js';
import { TenantContextService } from '../../../common/tenant-context.service.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { OutboxService } from '../../../infrastructure/outbox/outbox.service.js';
import {
  CreateSignatureRequestDto,
  SignDocumentDto,
  SignatureWebhookDto,
} from './dto/signature.dto.js';

@Injectable()
export class SignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async createSignatureRequest(dto: CreateSignatureRequestDto) {
    const tenantId = this.ctx.tenantId;

    const document = await this.prisma.documentRecord.findFirst({
      where: { id: dto.documentId, tenantId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('Document record not found');
    }

    const verificationToken = randomBytes(32).toString('hex');
    const externalEnvelopeId = `env_${randomUUID()}`;
    const provider = dto.provider ?? 'INTERNAL_EIDAS';

    const signatureRequest = await this.prisma.electronicSignatureRequest.create({
      data: {
        tenantId,
        documentId: document.id,
        signerName: dto.signerName.trim(),
        signerEmail: dto.signerEmail.trim().toLowerCase(),
        signerRole: dto.signerRole,
        provider,
        externalEnvelopeId,
        verificationToken,
        status: 'PENDING',
      },
    });

    await this.prisma.documentRecord.update({
      where: { id: document.id },
      data: { signatureStatus: 'PENDING' },
    });

    await this.audit.record(
      'signatures.request_created',
      'ElectronicSignatureRequest',
      signatureRequest.id,
      {
        documentId: document.id,
        signerEmail: signatureRequest.signerEmail,
        provider,
      },
    );

    await this.outbox.enqueue({
      type: 'DOCUMENT_SIGNATURE_REQUESTED',
      dedupeKey: `sig-${signatureRequest.id}`,
      payload: {
        requestId: signatureRequest.id,
        documentId: document.id,
        signerEmail: signatureRequest.signerEmail,
        verificationToken,
      },
    });

    return {
      ...signatureRequest,
      signingPortalUrl: `/portal/signatures/${verificationToken}`,
    };
  }

  async verifyAndSign(token: string, dto?: SignDocumentDto, clientIp?: string) {
    const request = await this.prisma.electronicSignatureRequest.findFirst({
      where: { verificationToken: token },
      include: {
        document: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Signature request not found or invalid token');
    }

    if (request.status === 'SIGNED') {
      throw new ConflictException('Document has already been signed');
    }

    const signedAt = new Date();
    const certificatePayload = `${request.documentId}:${request.signerEmail}:${signedAt.toISOString()}:${clientIp || '127.0.0.1'}`;
    const certificateHash = createHash('sha256').update(certificatePayload).digest('hex').toUpperCase();

    const auditTrail = {
      signerName: request.signerName,
      signerEmail: request.signerEmail,
      signerRole: request.signerRole,
      provider: request.provider,
      signedAtIso: signedAt.toISOString(),
      clientIp: clientIp || '127.0.0.1',
      certificateHash,
      eidasStandard: 'PAdES-B-LT (Advanced Electronic Signature)',
    };

    const updated = await this.prisma.electronicSignatureRequest.update({
      where: { id: request.id },
      data: {
        status: 'SIGNED',
        signedAt,
        ipAddress: clientIp || '127.0.0.1',
        certificateHash,
        auditTrail: auditTrail as Prisma.InputJsonValue,
      },
    });

    await this.prisma.documentRecord.update({
      where: { id: request.documentId },
      data: { signatureStatus: 'SIGNED' },
    });

    await this.audit.record(
      'signatures.document_signed',
      'ElectronicSignatureRequest',
      updated.id,
      {
        documentId: request.documentId,
        certificateHash,
      },
    );

    await this.outbox.enqueue({
      type: 'DOCUMENT_SIGNED',
      dedupeKey: `sig-signed-${updated.id}`,
      payload: {
        requestId: updated.id,
        documentId: request.documentId,
        certificateHash,
      },
    });

    return {
      ...updated,
      certificateHash,
      auditTrail,
    };
  }

  async processWebhook(dto: SignatureWebhookDto) {
    const request = await this.prisma.electronicSignatureRequest.findUnique({
      where: { externalEnvelopeId: dto.externalEnvelopeId },
      include: { document: true },
    });

    if (!request) {
      throw new NotFoundException(`Envelope ${dto.externalEnvelopeId} not found`);
    }

    if (dto.eventType === 'envelope.signed') {
      const signedAt = dto.signedAt ? new Date(dto.signedAt) : new Date();
      const certHash = createHash('sha256')
        .update(`${request.id}:${signedAt.toISOString()}`)
        .digest('hex')
        .toUpperCase();

      await this.prisma.electronicSignatureRequest.update({
        where: { id: request.id },
        data: {
          status: 'SIGNED',
          signedAt,
          certificateHash: certHash,
        },
      });

      await this.prisma.documentRecord.update({
        where: { id: request.documentId },
        data: { signatureStatus: 'SIGNED' },
      });

      await this.audit.record(
        'signatures.webhook_signed',
        'ElectronicSignatureRequest',
        request.id,
        {
          envelopeId: dto.externalEnvelopeId,
          certificateHash: certHash,
        },
      );

      return { status: 'SIGNED', envelopeId: dto.externalEnvelopeId };
    }

    return { received: true };
  }

  async getSignatureStatus(id: string) {
    const tenantId = this.ctx.tenantId;

    const request = await this.prisma.electronicSignatureRequest.findFirst({
      where: { id, tenantId },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            type: true,
            protocolNumber: true,
            signatureStatus: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Signature request not found');
    }

    return request;
  }
}
