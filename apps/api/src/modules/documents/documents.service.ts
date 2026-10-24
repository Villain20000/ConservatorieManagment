import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditService } from '../../common/audit.service.js';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { NotificationsService } from '../../common/notifications.service.js';
import { ScopeService } from '../../common/scope.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { DocumentType } from '../../generated/prisma/enums.js';
import { NumberingService } from '../../infrastructure/numbering/numbering.service.js';
import { OutboxService } from '../../infrastructure/outbox/outbox.service.js';
import { PdfService } from '../../infrastructure/pdf/pdf.service.js';
import { getTemplate, type TemplateContext } from '../../infrastructure/pdf/templates.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../infrastructure/storage/local-disk.storage.js';
import type {
  ArchiveDocumentDto,
  AttachDocumentFileDto,
  DocumentQueryDto,
  IssueDocumentDto,
} from './dto/documents.dto.js';

/** Maximum accepted upload for an attached document file (10 MiB). */
export const MAX_ATTACHED_FILE_BYTES = 10 * 1024 * 1024;

const RECORD_INCLUDE = {
  student: {
    select: { id: true, firstName: true, lastName: true, registrationNumber: true },
  },
  exam: { select: { id: true, title: true, examDate: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

const DEFAULT_TEMPLATES: Partial<Record<DocumentType, string>> = {
  REGISTRATION_FORM: 'registration-form.v1',
  ATTENDANCE_CERTIFICATE: 'attendance-certificate.v1',
  GRADE_TRANSCRIPT: 'grade-transcript.v1',
  CERTIFICATE: 'certificate.v1',
  DIPLOMA: 'diploma.v1',
  EXAM_RECORD: 'exam-minutes.v1',
};

const COMMITTEE_ROLE_LABELS: Record<string, string> = {
  PRESIDENT: 'Πρόεδρος',
  EXAMINER: 'Εξεταστής',
  MEMBER: 'Μέλος',
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly pdf: PdfService,
    private readonly numbering: NumberingService,
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  templates() {
    return this.pdf
      .templates()
      .filter((template) => template.key !== 'payment-receipt.v1')
      .map((template) => ({
        ...template,
        default: DEFAULT_TEMPLATES[template.type] === template.key,
      }));
  }

  async list(query: DocumentQueryDto) {
    const where: Prisma.DocumentRecordWhereInput = { tenantId: this.ctx.tenantId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.studentId) where.studentId = query.studentId;
    if (query.examId) where.examId = query.examId;
    if (query.from || query.to) {
      where.issuedAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { protocolNumber: { contains: query.search, mode: 'insensitive' } },
        { referenceNumber: { contains: query.search, mode: 'insensitive' } },
        { student: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { student: { lastName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.documentRecord.count({ where }),
      this.prisma.documentRecord.findMany({
        where,
        include: { ...RECORD_INCLUDE },
        orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);
    return {
      data: data.map((document) => ({
        ...document,
        referenceNumber: document.protocolNumber ?? document.referenceNumber,
      })),
      meta: pageMeta(total, query.page, query.pageSize),
    };
  }

  async stats() {
    const tenantId = this.ctx.tenantId;
    const [total, issued, draft, archived, students, documentedStudents] =
      await Promise.all([
        this.prisma.documentRecord.count({ where: { tenantId } }),
        this.prisma.documentRecord.count({ where: { tenantId, status: 'ISSUED' } }),
        this.prisma.documentRecord.count({ where: { tenantId, status: 'DRAFT' } }),
        this.prisma.documentRecord.count({ where: { tenantId, status: 'ARCHIVED' } }),
        this.prisma.student.count({ where: { tenantId, status: 'ACTIVE' } }),
        this.prisma.documentRecord.findMany({
          where: { tenantId, studentId: { not: null } },
          select: { studentId: true },
          distinct: ['studentId'],
        }),
      ]);

    return {
      total,
      issued,
      draft,
      archived,
      activeStudents: students,
      documentedStudents: documentedStudents.length,
      studentsWithoutDocuments: Math.max(0, students - documentedStudents.length),
      coverage:
        students === 0 ? 100 : Math.round((documentedStudents.length / students) * 100),
    };
  }

  async get(id: string) {
    const record = await this.prisma.documentRecord.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: { ...RECORD_INCLUDE },
    });
    if (!record) throw new NotFoundException('Το έγγραφο δεν βρέθηκε');
    return {
      ...record,
      referenceNumber: record.protocolNumber ?? record.referenceNumber,
    };
  }

  async create(dto: IssueDocumentDto) {
    const tenantId = this.ctx.tenantId;
    if (dto.type === 'EXAM_RECORD' && !dto.examId) {
      throw new BadRequestException('Απαιτείται εξέταση για το πρακτικό');
    }
    if (dto.type !== 'EXAM_RECORD' && !dto.studentId) {
      throw new BadRequestException('Απαιτείται μαθητής για αυτόν τον τύπο εγγράφου');
    }

    const templateKey = dto.templateKey ?? DEFAULT_TEMPLATES[dto.type];
    if (!templateKey) {
      throw new BadRequestException('Δεν υπάρχει πρότυπο για αυτόν τον τύπο εγγράφου');
    }
    const template = getTemplate(templateKey);
    if (template.type !== dto.type) {
      throw new BadRequestException('Το πρότυπο δεν αντιστοιχεί στον τύπο εγγράφου');
    }

    let studentName = '';
    if (dto.studentId) {
      await this.scope.assertStudentAccessible(dto.studentId);
      const student = await this.prisma.student.findFirst({
        where: { id: dto.studentId, tenantId },
        select: { firstName: true, lastName: true },
      });
      if (!student) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');
      studentName = `${student.firstName} ${student.lastName}`;
    }

    if (dto.examId) {
      const exam = await this.prisma.exam.findFirst({
        where: { id: dto.examId, tenantId },
        select: { id: true, title: true },
      });
      if (!exam) throw new NotFoundException('Η εξέταση δεν βρέθηκε');
      if (dto.type === 'EXAM_RECORD') studentName = exam.title;
    }

    const record = await this.prisma.documentRecord.create({
      data: {
        tenantId,
        studentId: dto.studentId ?? null,
        examId: dto.examId ?? null,
        type: dto.type,
        title: dto.title?.trim() || template.title,
        templateKey,
        templateVersion: templateVersion(templateKey),
        notes: dto.notes?.trim() || null,
        status: 'DRAFT',
        preparedById: this.ctx.userId,
      },
    });

    await this.audit.record('document.created', 'DocumentRecord', record.id, {
      type: record.type,
      student: studentName || null,
      draft: dto.draft !== false,
    });

    if (dto.draft === false) {
      return this.issue(record.id);
    }
    return record;
  }

  async issue(id: string) {
    const record = await this.findTenantRecord(id);
    if (record.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'DOCUMENT_NOT_DRAFT',
        message: 'Το έγγραφο έχει ήδη εκδοθεί',
      });
    }

    const context = await this.buildContext(record);
    const buffer = await this.pdf.render(resolveTemplateKey(record), context);
    const protocolNumber = await this.numbering.nextDocument();
    const storageKey = `tenants/${this.ctx.tenantId}/documents/${record.id}.pdf`;
    await this.storage.put(storageKey, buffer, 'application/pdf');

    const fileName = fileNameFor(record.type, protocolNumber, record.id);
    const result = await this.prisma.$transaction(async (tx) => {
      const file = await tx.storedFile.create({
        data: {
          tenantId: this.ctx.tenantId,
          storageKey,
          fileName,
          contentType: 'application/pdf',
          size: buffer.length,
          sha256: createHash('sha256').update(buffer).digest('hex'),
          createdById: this.ctx.userId,
        },
      });
      return tx.documentRecord.update({
        where: { id: record.id },
        data: {
          protocolNumber,
          fileId: file.id,
          fileName,
          issuedAt: new Date(),
          issuedById: this.ctx.userId,
          // A fresh issuance supersedes any prior approval.
          approvedAt: null,
          approvedById: null,
          version: record.fileId ? record.version + 1 : record.version,
          status: 'ISSUED',
        },
        include: { ...RECORD_INCLUDE },
      });
    });

    await this.notifyIssued(result);
    await this.audit.record('document.issued', 'DocumentRecord', record.id, {
      protocolNumber,
      type: record.type,
      fileName,
    });
    return result;
  }

  async archive(id: string, dto: ArchiveDocumentDto) {
    const record = await this.findTenantRecord(id);
    if (record.status === 'ARCHIVED') {
      throw new ConflictException({ code: 'DOCUMENT_ARCHIVED', message: 'Το έγγραφο έχει αρχειοθετηθεί' });
    }
    const updated = await this.prisma.documentRecord.update({
      where: { id: record.id },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
        notes: dto.reason ? appendNote(record.notes, dto.reason) : record.notes,
      },
    });
    await this.audit.record('document.archived', 'DocumentRecord', record.id, {
      reason: dto.reason ?? null,
    });
    return updated;
  }

  async approve(id: string) {
    const record = await this.findTenantRecord(id);
    if (record.status === 'ARCHIVED') {
      throw new ConflictException({
        code: 'DOCUMENT_ARCHIVED',
        message: 'Το έγγραφο έχει αρχειοθετηθεί',
      });
    }
    if (record.status !== 'ISSUED') {
      throw new ConflictException({
        code: 'DOCUMENT_NOT_ISSUED',
        message: 'Μόνο εκδοθέντα έγγραφα μπορούν να εγκριθούν',
      });
    }
    if (record.approvedAt) {
      throw new ConflictException({
        code: 'DOCUMENT_ALREADY_APPROVED',
        message: 'Το έγγραφο έχει ήδη εγκριθεί',
      });
    }
    const updated = await this.prisma.documentRecord.update({
      where: { id: record.id },
      data: { approvedAt: new Date(), approvedById: this.ctx.userId },
      include: { ...RECORD_INCLUDE },
    });
    await this.audit.record('document.approved', 'DocumentRecord', record.id, {
      protocolNumber: record.protocolNumber,
      type: record.type,
    });
    return updated;
  }

  /**
   * Attaches an externally produced file (e.g. a scanned signed copy) to the
   * record. The upload is stored as a new StoredFile row and bumps the
   * record version, so every file generation or upload is traceable through
   * the version history.
   */
  async attachFile(id: string, dto: AttachDocumentFileDto) {
    const record = await this.findTenantRecord(id);
    if (record.status === 'ARCHIVED') {
      throw new ConflictException({
        code: 'DOCUMENT_ARCHIVED',
        message: 'Το έγγραφο έχει αρχειοθετηθεί',
      });
    }
    const buffer = Buffer.from(dto.contentBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_ATTACHED_FILE_BYTES) {
      throw new BadRequestException('Το αρχείο πρέπει να είναι έως 10 MB');
    }
    const fileName = dto.fileName.trim();
    if (!fileName) {
      throw new BadRequestException('Απαιτείται όνομα αρχείου');
    }
    const nextVersion = record.version + 1;
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `tenants/${this.ctx.tenantId}/documents/${record.id}/v${nextVersion}-${safeName}`;
    await this.storage.put(storageKey, buffer, dto.contentType);
    const updated = await this.prisma.$transaction(async (tx) => {
      const file = await tx.storedFile.create({
        data: {
          tenantId: this.ctx.tenantId,
          storageKey,
          fileName,
          contentType: dto.contentType,
          size: buffer.length,
          sha256: createHash('sha256').update(buffer).digest('hex'),
          createdById: this.ctx.userId,
        },
      });
      return tx.documentRecord.update({
        where: { id: record.id },
        data: { fileId: file.id, fileName, version: nextVersion },
        include: { ...RECORD_INCLUDE },
      });
    });
    await this.audit.record('document.file_attached', 'DocumentRecord', record.id, {
      fileName,
      version: nextVersion,
    });
    return updated;
  }

  /**
   * Version history of a document: every creation, issuance, approval,
   * upload and archival event, newest first.
   */
  async history(id: string) {
    await this.findTenantRecord(id);
    const data = await this.prisma.auditLog.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        entityType: 'DocumentRecord',
        entityId: id,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { data };
  }

  /**
   * Links an exam to its minutes record. The record produced on publish is
   * intentionally kept as a DRAFT (watermarked «ΜΗ ΕΠΙΣΗΜΟ», no protocol
   * number): it carries no legal validity until staff explicitly issue it
   * through the documents flow (DOCUMENTS_WRITE).
   */
  async ensureExamRecord(examId: string) {
    const existing = await this.prisma.documentRecord.findFirst({
      where: {
        tenantId: this.ctx.tenantId,
        examId,
        type: 'EXAM_RECORD',
        status: { not: 'ARCHIVED' },
      },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, registrationNumber: true },
        },
        exam: { select: { id: true, title: true, examDate: true } },
      },
    });
    if (existing) {
      return existing;
    }
    return this.create({ type: 'EXAM_RECORD', examId });
  }

  async pdfForDocument(id: string) {
    const record = await this.findTenantRecord(id);
    if (record.studentId) {
      await this.scope.assertStudentAccessible(record.studentId);
    }
    return this.renderRecord(record.id);
  }

  async pdfForStudent(id: string, studentId: string) {
    const record = await this.prisma.documentRecord.findFirst({
      where: { id, tenantId: this.ctx.tenantId, studentId },
    });
    if (!record) throw new NotFoundException('Το έγγραφο δεν βρέθηκε');
    return this.renderRecord(record.id);
  }

  async studentDocuments(studentId: string) {
    await this.scope.assertStudentAccessible(studentId);
    const documents = await this.prisma.documentRecord.findMany({
      where: { tenantId: this.ctx.tenantId, studentId },
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return documents.map((document) => ({
      ...document,
      referenceNumber: document.protocolNumber ?? document.referenceNumber,
    }));
  }

  private async renderRecord(id: string) {
    const record = await this.findTenantRecord(id);
    if (record.fileId) {
      const file = await this.prisma.storedFile.findFirst({
        where: { id: record.fileId, tenantId: this.ctx.tenantId },
      });
      if (file) {
        try {
          const buffer = await this.storage.get(file.storageKey);
          return { buffer, fileName: file.fileName };
        } catch {
          // Fall through to re-render when the stored object is unavailable.
        }
      }
    }
    const context = await this.buildContext(record);
    const buffer = await this.pdf.render(resolveTemplateKey(record), context);
    return {
      buffer,
      fileName: record.fileName ?? fileNameFor(record.type, record.protocolNumber, record.id),
    };
  }

  private async findTenantRecord(id: string) {
    const record = await this.prisma.documentRecord.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!record) throw new NotFoundException('Το έγγραφο δεν βρέθηκε');
    return record;
  }

  private async buildContext(
    record: Prisma.DocumentRecordGetPayload<Record<string, never>>,
  ): Promise<TemplateContext> {
    const tenantId = this.ctx.tenantId;
    const [tenant, student] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, legalName: true },
      }),
      record.studentId
        ? this.prisma.student.findFirst({
            where: { id: record.studentId, tenantId },
            include: {
              branch: { select: { name: true } },
              guardians: {
                include: {
                  guardian: {
                    select: { firstName: true, lastName: true, phone: true },
                  },
                },
                orderBy: { isPrimary: 'desc' },
              },
              enrollments: {
                where: { status: 'ACTIVE' },
                include: {
                  program: { select: { name: true } },
                  level: { select: { name: true } },
                  academicYear: { select: { name: true } },
                },
                orderBy: { enrolledAt: 'desc' },
                take: 1,
              },
            },
          })
        : Promise.resolve(null),
    ]);

    const enrollment = student?.enrollments[0] ?? null;
    const studentSnapshot = student
      ? {
          firstName: student.firstName,
          lastName: student.lastName,
          registrationNumber: student.registrationNumber,
          birthDate: student.birthDate?.toISOString() ?? null,
          branch: student.branch?.name ?? null,
          program: enrollment?.program.name ?? null,
          level: enrollment?.level.name ?? null,
        }
      : null;

    let data: Record<string, unknown> = {};
    if (student) {
      if (record.type === 'REGISTRATION_FORM') {
        data = {
          guardians: student.guardians.map((link) => ({
            name: `${link.guardian.firstName} ${link.guardian.lastName}`,
            relationship: link.relationship,
            phone: link.guardian.phone,
          })),
        };
      } else if (record.type === 'ATTENDANCE_CERTIFICATE') {
        data = await this.attendanceData(student.id);
      } else if (record.type === 'GRADE_TRANSCRIPT') {
        data = await this.gradeData(student.id);
      } else if (record.type === 'CERTIFICATE' || record.type === 'DIPLOMA') {
        data = {
          program: enrollment?.program.name ?? null,
          level: enrollment?.level.name ?? null,
          academicYear: enrollment?.academicYear.name ?? null,
          award: record.type === 'DIPLOMA' ? record.title : null,
        };
      }
    }

    if (record.examId) {
      data = { ...data, ...(await this.examData(record.examId)) };
    }

    return {
      tenant: { name: tenant?.name ?? '', legalName: tenant?.legalName ?? null },
      student: studentSnapshot,
      protocolNumber: record.protocolNumber,
      issuedAt: record.issuedAt ?? new Date(),
      watermark: record.status === 'DRAFT',
      data,
    };
  }

  private async attendanceData(studentId: string) {
    const groups = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: { tenantId: this.ctx.tenantId, studentId },
      _count: { _all: true },
    });
    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
    for (const group of groups) counts[group.status] = group._count._all;
    const total = counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;
    return {
      ...counts,
      total,
      rate:
        total === 0
          ? null
          : Math.round(((counts.PRESENT + counts.LATE) / total) * 100),
      periodLabel: 'την τρέχουσα περίοδο',
    };
  }

  private async gradeData(studentId: string) {
    const results = await this.prisma.examResult.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        studentId,
        exam: { status: 'PUBLISHED' },
      },
      include: { exam: { select: { title: true, examDate: true } } },
      orderBy: { exam: { examDate: 'desc' } },
    });
    return {
      grades: results.map((result) => ({
        exam: result.exam.title,
        date: result.exam.examDate,
        grade: result.grade === null ? null : Number(result.grade),
        outcome: result.outcome,
      })),
    };
  }

  private async examData(examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, tenantId: this.ctx.tenantId },
      include: {
        program: { select: { name: true } },
        committee: {
          include: { teacher: { select: { firstName: true, lastName: true } } },
          orderBy: { role: 'asc' },
        },
        results: {
          include: { student: { select: { firstName: true, lastName: true } } },
          orderBy: { student: { lastName: 'asc' } },
        },
      },
    });
    if (!exam) return {};
    return {
      examTitle: exam.title,
      examDate: exam.examDate,
      location: exam.location,
      program: exam.program.name,
      committee: exam.committee.map((member) => ({
        name: `${member.teacher.lastName} ${member.teacher.firstName}`,
        role: COMMITTEE_ROLE_LABELS[member.role] ?? member.role,
      })),
      results: exam.results.map((result) => ({
        student: `${result.student.lastName} ${result.student.firstName}`,
        grade: result.grade === null ? null : Number(result.grade),
        outcome: result.outcome,
      })),
    };
  }

  private async notifyIssued(record: {
    id: string;
    type: DocumentType;
    title: string;
    studentId: string | null;
    examId: string | null;
  }) {
    const tenantId = this.ctx.tenantId;
    let userIds: string[] = [];
    const emails: string[] = [];

    if (record.studentId) {
      const student = await this.prisma.student.findFirst({
        where: { id: record.studentId, tenantId },
        include: {
          user: { select: { id: true, email: true } },
          guardians: {
            include: {
              guardian: { include: { user: { select: { email: true } } } },
            },
          },
        },
      });
      if (student) {
        userIds = [
          student.userId,
          ...student.guardians.map((link) => link.guardian.userId),
        ].filter((value): value is string => Boolean(value));
        emails.push(
          ...[
            student.email,
            student.user?.email,
            ...student.guardians.flatMap((link) => [
              link.guardian.email,
              link.guardian.user?.email,
            ]),
          ].filter((value): value is string => Boolean(value)),
        );
      }
    } else if (record.examId) {
      const committee = await this.prisma.examCommitteeMember.findMany({
        where: { examId: record.examId, tenantId },
        include: { teacher: { include: { user: { select: { id: true, email: true } } } } },
      });
      userIds = committee
        .map((member) => member.teacher.userId)
        .filter((value): value is string => Boolean(value));
      emails.push(
        ...committee
          .map((member) => member.teacher.user?.email ?? member.teacher.email)
          .filter((value): value is string => Boolean(value)),
      );
    }

    await this.notifications.createForUsers(userIds, {
      type: 'DOCUMENT_ISSUED',
      title: 'Νέο έγγραφο',
      body: `Εκδόθηκε το έγγραφο «${record.title}».`,
      entityType: 'DocumentRecord',
      entityId: record.id,
    });

    for (const email of [...new Set(emails)]) {
      await this.outbox.enqueue({
        type: 'email',
        dedupeKey: `document-email:${record.id}:${email}`,
        payload: {
          to: email,
          subject: `Νέο έγγραφο: ${record.title}`,
          text: `Το έγγραφο «${record.title}» είναι διαθέσιμο στο περιβάλλον MusicOS.`,
        },
      });
    }
  }
}

function resolveTemplateKey(record: {
  type: DocumentType;
  templateKey: string | null;
}): string {
  const key = record.templateKey ?? DEFAULT_TEMPLATES[record.type];
  if (!key) {
    throw new BadRequestException('Δεν υπάρχει πρότυπο για αυτόν τον τύπο εγγράφου');
  }
  return key;
}

function templateVersion(templateKey: string): number {
  const match = templateKey.match(/\.v(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function fileNameFor(type: DocumentType, protocol: string | null, id: string): string {
  const safeProtocol = (protocol ?? id.slice(0, 8)).replace(/[^a-zA-Z0-9-]/g, '');
  return `${type.toLowerCase()}-${safeProtocol}.pdf`;
}

function appendNote(notes: string | null, reason: string): string {
  const line = `Αρχειοθέτηση: ${reason}`;
  return notes ? `${notes}\n${line}` : line;
}
