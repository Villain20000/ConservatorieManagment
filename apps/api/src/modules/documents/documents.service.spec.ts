import { BadRequestException, ConflictException } from '@nestjs/common';
import { MAX_ATTACHED_FILE_BYTES, DocumentsService } from './documents.service.js';
import { getTemplate } from '../../infrastructure/pdf/templates.js';

function createHarness() {
  const tx = {
    storedFile: { create: vi.fn() },
    documentRecord: { update: vi.fn() },
  };
  tx.storedFile.create.mockImplementation(async (args: { data: object }) => ({
    id: 'file-1',
    ...args.data,
  }));
  tx.documentRecord.update.mockImplementation(async (args: { data: object }) => ({
    id: 'doc-1',
    ...args.data,
  }));
  const prisma = {
    documentRecord: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    storedFile: { findFirst: vi.fn() },
    student: { findFirst: vi.fn() },
    exam: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    attendance: { groupBy: vi.fn() },
    examResult: { findMany: vi.fn() },
    examCommitteeMember: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.documentRecord.count.mockResolvedValue(0);
  prisma.documentRecord.findMany.mockResolvedValue([]);
  prisma.storedFile.findFirst.mockResolvedValue(null);
  prisma.student.findFirst.mockResolvedValue(null);
  prisma.exam.findFirst.mockResolvedValue(null);
  prisma.tenant.findUnique.mockResolvedValue({ name: 'Ωδείο', legalName: null });
  prisma.attendance.groupBy.mockResolvedValue([]);
  prisma.examResult.findMany.mockResolvedValue([]);
  prisma.examCommitteeMember.findMany.mockResolvedValue([]);
  prisma.auditLog.findMany.mockResolvedValue([]);
  prisma.$transaction.mockImplementation(async (work: unknown) =>
    typeof work === 'function' ? (work as (t: unknown) => unknown)(tx) : work,
  );
  const ctx = { tenantId: 'tenant-1', userId: 'user-1' };
  const scope = { assertStudentAccessible: vi.fn() };
  const audit = { record: vi.fn() };
  const pdf = { render: vi.fn(), templates: vi.fn() };
  const numbering = { nextDocument: vi.fn() };
  const outbox = { enqueue: vi.fn() };
  const notifications = { createForUsers: vi.fn() };
  const storage = { put: vi.fn(), get: vi.fn(), delete: vi.fn(), exists: vi.fn() };
  scope.assertStudentAccessible.mockResolvedValue(undefined);
  audit.record.mockResolvedValue(undefined);
  pdf.render.mockResolvedValue(Buffer.from('%PDF-mock'));
  pdf.templates.mockReturnValue([]);
  numbering.nextDocument.mockResolvedValue('PRT-2026-000001');
  outbox.enqueue.mockResolvedValue(undefined);
  notifications.createForUsers.mockResolvedValue(undefined);
  storage.put.mockResolvedValue(undefined);
  storage.get.mockResolvedValue(Buffer.from('%PDF-mock'));
  storage.delete.mockResolvedValue(undefined);
  storage.exists.mockResolvedValue(false);
  const service = new DocumentsService(
    prisma as never,
    ctx as never,
    scope as never,
    audit as never,
    pdf as never,
    numbering as never,
    outbox as never,
    notifications as never,
    storage as never,
  );
  return { prisma, tx, ctx, scope, audit, pdf, numbering, outbox, notifications, storage, service };
}

const DRAFT_RECORD = {
  id: 'doc-1',
  tenantId: 'tenant-1',
  studentId: 'student-1',
  examId: null,
  type: 'CERTIFICATE',
  title: 'Βεβαίωση',
  protocolNumber: null,
  referenceNumber: null,
  templateKey: 'certificate.v1',
  templateVersion: 1,
  fileId: null,
  fileName: null,
  issuedAt: null,
  issuedById: null,
  preparedById: 'user-1',
  approvedById: null,
  approvedAt: null,
  version: 1,
  status: 'DRAFT',
  notes: null,
};

const ISSUED_RECORD = {
  ...DRAFT_RECORD,
  status: 'ISSUED',
  protocolNumber: 'PRT-2026-000001',
  issuedAt: new Date('2026-09-15T11:00:00Z'),
  issuedById: 'user-1',
  fileId: 'file-1',
  fileName: 'certificate-PRT-2026-000001.pdf',
};

describe('DocumentsService filters', () => {
  it('applies student, exam and date-range filters to the list query', async () => {
    const { prisma, service } = createHarness();
    await service.list({
      page: 1,
      pageSize: 20,
      skip: 0,
      studentId: 'student-1',
      examId: 'exam-1',
      from: '2026-09-01',
      to: '2026-09-30',
    } as never);
    const where = prisma.documentRecord.findMany.mock.calls[0][0].where;
    expect(where.studentId).toBe('student-1');
    expect(where.examId).toBe('exam-1');
    expect(where.issuedAt).toMatchObject({
      gte: new Date('2026-09-01'),
      lte: new Date('2026-09-30'),
    });
  });
});

describe('DocumentsService create', () => {
  it('requires an exam for EXAM_RECORD documents', async () => {
    const { service } = createHarness();
    await expect(service.create({ type: 'EXAM_RECORD' } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('DocumentsService issue', () => {
  it('refuses to issue a non-draft document', async () => {
    const { prisma, service } = createHarness();
    prisma.documentRecord.findFirst.mockResolvedValue(ISSUED_RECORD);
    await expect(service.issue('doc-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DOCUMENT_NOT_DRAFT' }),
    });
  });

  it('assigns a PRT protocol number on issue', async () => {
    const { prisma, numbering, service } = createHarness();
    prisma.documentRecord.findFirst.mockResolvedValue({ ...DRAFT_RECORD });
    prisma.tenant.findUnique.mockResolvedValue({ name: 'Ωδείο', legalName: null });
    prisma.student.findFirst.mockResolvedValue({
      firstName: 'Μαρίνα',
      lastName: 'Φωτίου',
      registrationNumber: 'REG-1',
      birthDate: null,
      branch: null,
      guardians: [],
      enrollments: [],
    });
    await service.issue('doc-1');
    expect(numbering.nextDocument).toHaveBeenCalledTimes(1);
    const update = (prisma.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof update).toBe('function');
  });

  it('renders drafts with the DRAFT watermark and issued docs without it', async () => {
    const { prisma, pdf, service } = createHarness();
    prisma.tenant.findUnique.mockResolvedValue({ name: 'Ωδείο', legalName: null });
    prisma.student.findFirst.mockResolvedValue({
      firstName: 'Μαρίνα',
      lastName: 'Φωτίου',
      registrationNumber: 'REG-1',
      birthDate: null,
      branch: null,
      guardians: [],
      enrollments: [],
    });
    prisma.documentRecord.findFirst.mockResolvedValue({ ...DRAFT_RECORD });
    await service.pdfForDocument('doc-1');
    expect(pdf.render.mock.calls[0][1]).toMatchObject({ watermark: true });
    pdf.render.mockClear();
    prisma.documentRecord.findFirst.mockResolvedValue({ ...ISSUED_RECORD });
    prisma.storedFile.findFirst.mockResolvedValue({
      id: 'file-1',
      storageKey: 'tenants/tenant-1/documents/doc-1.pdf',
      fileName: 'certificate-PRT-2026-000001.pdf',
    });
    const stored = await service.pdfForDocument('doc-1');
    expect(pdf.render).not.toHaveBeenCalled();
    expect(stored.fileName).toBe('certificate-PRT-2026-000001.pdf');
  });
});

describe('DocumentsService approve', () => {
  it('refuses to approve a draft', async () => {
    const { prisma, service } = createHarness();
    prisma.documentRecord.findFirst.mockResolvedValue({ ...DRAFT_RECORD });
    await expect(service.approve('doc-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DOCUMENT_NOT_ISSUED' }),
    });
  });

  it('refuses to approve twice', async () => {
    const { prisma, service } = createHarness();
    prisma.documentRecord.findFirst.mockResolvedValue({
      ...ISSUED_RECORD,
      approvedAt: new Date(),
      approvedById: 'user-1',
    });
    await expect(service.approve('doc-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DOCUMENT_ALREADY_APPROVED' }),
    });
  });

  it('records the approver and timestamp', async () => {
    const { prisma, audit, service } = createHarness();
    prisma.documentRecord.findFirst.mockResolvedValue({ ...ISSUED_RECORD });
    prisma.documentRecord.update.mockResolvedValue({
      ...ISSUED_RECORD,
      approvedAt: new Date(),
      approvedById: 'user-1',
    });
    await service.approve('doc-1');
    expect(prisma.documentRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvedById: 'user-1' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      'document.approved',
      'DocumentRecord',
      'doc-1',
      expect.anything(),
    );
  });
});

describe('DocumentsService attachFile', () => {
  const dto = {
    fileName: 'signed.pdf',
    contentType: 'application/pdf',
    contentBase64: Buffer.from('%PDF-signed').toString('base64'),
  };

  it('rejects uploads on archived documents', async () => {
    const { prisma, service } = createHarness();
    prisma.documentRecord.findFirst.mockResolvedValue({ ...ISSUED_RECORD, status: 'ARCHIVED' });
    await expect(service.attachFile('doc-1', dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects empty uploads', async () => {
    const { prisma, service } = createHarness();
    prisma.documentRecord.findFirst.mockResolvedValue({ ...ISSUED_RECORD });
    await expect(
      service.attachFile('doc-1', { ...dto, contentBase64: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores the file as a StoredFile and bumps the version', async () => {
    const { prisma, tx, storage, audit, service } = createHarness();
    prisma.documentRecord.findFirst.mockResolvedValue({ ...ISSUED_RECORD });
    await service.attachFile('doc-1', dto);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(tx.storedFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contentType: 'application/pdf', fileName: 'signed.pdf' }),
      }),
    );
    expect(tx.documentRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 2 }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      'document.file_attached',
      'DocumentRecord',
      'doc-1',
      expect.objectContaining({ version: 2 }),
    );
  });

  it('caps uploads at MAX_ATTACHED_FILE_BYTES', () => {
    expect(MAX_ATTACHED_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('DocumentsService history', () => {
  it('returns the audit trail for the document', async () => {
    const { prisma, service } = createHarness();
    prisma.documentRecord.findFirst.mockResolvedValue({ ...ISSUED_RECORD });
    const events = [{ action: 'document.issued' }, { action: 'document.created' }];
    prisma.auditLog.findMany.mockResolvedValue(events);
    const result = await service.history('doc-1');
    expect(result).toEqual({ data: events });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ entityType: 'DocumentRecord', entityId: 'doc-1' }),
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});

describe('document templates', () => {
  it('keeps the DRAFT watermark and the disclaimer footer', () => {
    const template = getTemplate('certificate.v1');
    const definition = template.build({
      tenant: { name: 'Ωδείο', legalName: null },
      student: null,
      protocolNumber: null,
      issuedAt: new Date('2026-09-15T11:00:00Z'),
      watermark: true,
      data: {},
    }) as { watermark?: { text?: string }; footer?: (page: number, total: number) => unknown };
    expect(definition.watermark?.text).toBe('ΜΗ ΕΠΙΣΗΜΟ');
    const footer = definition.footer?.(1, 2) as { columns?: { text?: string }[] };
    const text = JSON.stringify(footer?.columns ?? []);
    expect(text).toContain('δεν αποτελεί επίσημο δημόσιο έγγραφο');
  });
});
