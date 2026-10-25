import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service.js';
import { PrismaService } from '../database/prisma.service.js';

/**
 * Domain guards for soft deletion.
 *
 * "Can this be deleted?" is a business rule, not a transport concern: the same
 * checks must run whether the delete arrives over HTTP, from a background job or
 * from a future bulk action. Each guard throws a typed 409 so clients can react
 * to the reason instead of a bare message.
 *
 * Restoring a record is an ordinary `update({ data: { deletedAt: null } })` in
 * the owning module; the query extension deliberately does not touch updates.
 */
@Injectable()
export class SoftDeleteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
  ) {}

  /**
   * A student with money still owed must not vanish: the receivable would be
   * orphaned and the ledger would stop reconciling.
   */
  async assertStudentDeletable(studentId: string): Promise<void> {
    const tenantId = this.ctx.tenantId;

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true },
    });
    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: 'Ο μαθητής δεν βρέθηκε',
      });
    }

    const charges = await this.prisma.charge.findMany({
      where: { tenantId, studentId, status: { not: 'CANCELLED' } },
      select: { amountCents: true, paidAmountCents: true },
    });

    if (charges.some((charge) => charge.amountCents > charge.paidAmountCents)) {
      throw new ConflictException({
        code: 'STUDENT_HAS_OUTSTANDING_BALANCE',
        message: 'Ο μαθητής έχει ανεξόφλητες χρεώσεις και δεν μπορεί να διαγραφεί',
      });
    }
  }

  /**
   * A teacher who still runs an active series cannot be deleted: the series
   * would be left pointing at a hidden record.
   */
  async assertTeacherDeletable(teacherId: string): Promise<void> {
    const tenantId = this.ctx.tenantId;

    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenantId },
      select: { id: true },
    });
    if (!teacher) {
      throw new NotFoundException({
        code: 'TEACHER_NOT_FOUND',
        message: 'Ο καθηγητής δεν βρέθηκε',
      });
    }

    const activeSeries = await this.prisma.lessonSeries.count({
      where: { tenantId, teacherId, status: 'ACTIVE' },
    });

    if (activeSeries > 0) {
      throw new ConflictException({
        code: 'TEACHER_HAS_ACTIVE_SERIES',
        message: 'Ο καθηγητής έχει ενεργά τμήματα και δεν μπορεί να διαγραφεί',
      });
    }
  }

  /**
   * Only drafts may be deleted. Issued documents are legal records: the correct
   * verb for them is archive, never delete.
   */
  async assertDocumentDeletable(documentId: string): Promise<void> {
    const tenantId = this.ctx.tenantId;

    const document = await this.prisma.documentRecord.findFirst({
      where: { id: documentId, tenantId },
      select: { id: true, status: true },
    });
    if (!document) {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Το έγγραφο δεν βρέθηκε',
      });
    }

    if (document.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'DOCUMENT_NOT_DRAFT',
        message: 'Μόνο πρόχειρα έγγραφα μπορούν να διαγραφούν — τα εκδοθέντα αρχειοθετούνται',
      });
    }
  }
}
