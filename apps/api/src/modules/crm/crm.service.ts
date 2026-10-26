import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { EntitlementsService } from '../../common/entitlements.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  LeadActivityType,
  LeadSource,
  LeadStage,
} from '../../generated/prisma/enums.js';
import type { ConvertLeadDto } from './dto/convert-lead.dto.js';
import type { CreateActivityDto } from './dto/create-activity.dto.js';
import type { CreateLeadDto } from './dto/create-lead.dto.js';
import type { LeadQueryDto } from './dto/lead-query.dto.js';
import type { UpdateLeadDto } from './dto/update-lead.dto.js';

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async listLeads(query: LeadQueryDto) {
    const tenantId = this.ctx.tenantId;
    const where: Prisma.LeadWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query.stage) where.stage = query.stage;
    if (query.source) where.source = query.source;
    if (query.branchId) where.branchId = query.branchId;
    if (query.programId) where.programId = query.programId;
    if (query.assignedToId) where.assignedToId = query.assignedToId;

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { studentFirstName: { contains: term, mode: 'insensitive' } },
        { studentLastName: { contains: term, mode: 'insensitive' } },
        { contactName: { contains: term, mode: 'insensitive' } },
        { contactEmail: { contains: term, mode: 'insensitive' } },
        { contactPhone: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          program: { select: { id: true, name: true, color: true } },
          assignedTo: { select: { id: true, email: true } },
          _count: { select: { activities: true } },
        },
        orderBy: [{ nextFollowUpAt: 'asc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);

    return { data, meta: pageMeta(total, query.page, query.pageSize) };
  }

  async getLead(id: string) {
    const tenantId = this.ctx.tenantId;
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        program: { select: { id: true, name: true, color: true } },
        assignedTo: { select: { id: true, email: true } },
        convertedStudent: {
          select: { id: true, firstName: true, lastName: true, registrationNumber: true },
        },
        activities: {
          include: {
            actor: { select: { id: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!lead) throw new NotFoundException('Ο υποψήφιος δεν βρέθηκε');
    return lead;
  }

  async createLead(dto: CreateLeadDto) {
    const tenantId = this.ctx.tenantId;
    await this.requireBranch(dto.branchId);
    if (dto.programId) await this.requireProgram(dto.programId);

    const lead = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          studentFirstName: dto.studentFirstName.trim(),
          studentLastName: dto.studentLastName.trim(),
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          contactName: dto.contactName.trim(),
          contactEmail: dto.contactEmail?.toLowerCase().trim(),
          contactPhone: dto.contactPhone?.trim(),
          relationship: dto.relationship?.trim(),
          source: dto.source ?? LeadSource.WEB_FORM,
          stage: dto.stage ?? LeadStage.NEW,
          programId: dto.programId,
          notes: dto.notes?.trim(),
          assignedToId: dto.assignedToId,
          nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
          consentAt: dto.consentAt ? new Date(dto.consentAt) : undefined,
        },
      });

      await tx.leadActivity.create({
        data: {
          tenantId,
          leadId: created.id,
          actorId: this.ctx.userId,
          type: LeadActivityType.NOTE,
          toStage: created.stage,
          body: 'Καταχώρηση νέου υποψηφίου στο σύστημα',
        },
      });

      return created;
    });

    await this.audit.record('crm.lead.created', 'Lead', lead.id, {
      student: `${dto.studentFirstName} ${dto.studentLastName}`,
      stage: lead.stage,
    });

    return this.getLead(lead.id);
  }

  async updateLead(id: string, dto: UpdateLeadDto) {
    const current = await this.requireLead(id);
    if (dto.branchId) await this.requireBranch(dto.branchId);
    if (dto.programId) await this.requireProgram(dto.programId);

    const stageChanged = dto.stage && dto.stage !== current.stage;

    const updated = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.update({
        where: { id },
        data: {
          branchId: dto.branchId,
          studentFirstName: dto.studentFirstName?.trim(),
          studentLastName: dto.studentLastName?.trim(),
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          contactName: dto.contactName?.trim(),
          contactEmail: dto.contactEmail?.toLowerCase().trim(),
          contactPhone: dto.contactPhone?.trim(),
          relationship: dto.relationship?.trim(),
          source: dto.source,
          stage: dto.stage,
          programId: dto.programId,
          notes: dto.notes?.trim(),
          assignedToId: dto.assignedToId,
          nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
          lostReason: dto.lostReason?.trim(),
          consentAt: dto.consentAt ? new Date(dto.consentAt) : undefined,
        },
      });

      if (stageChanged) {
        await tx.leadActivity.create({
          data: {
            tenantId: this.ctx.tenantId,
            leadId: id,
            actorId: this.ctx.userId,
            type: LeadActivityType.STAGE_CHANGE,
            fromStage: current.stage,
            toStage: dto.stage,
            body: dto.lostReason
              ? `Αλλαγή σταδίου σε ${dto.stage} (Αιτιολογία: ${dto.lostReason})`
              : `Αλλαγή σταδίου σε ${dto.stage}`,
          },
        });
      }

      return lead;
    });

    await this.audit.record('crm.lead.updated', 'Lead', updated.id, {
      stage: updated.stage,
      stageChanged,
    });

    return this.getLead(updated.id);
  }

  async changeStage(id: string, toStage: LeadStage, body?: string) {
    const current = await this.requireLead(id);
    if (current.stage === toStage) return this.getLead(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id },
        data: {
          stage: toStage,
          lostReason: toStage === LeadStage.LOST ? body : null,
        },
      });

      await tx.leadActivity.create({
        data: {
          tenantId: this.ctx.tenantId,
          leadId: id,
          actorId: this.ctx.userId,
          type: LeadActivityType.STAGE_CHANGE,
          fromStage: current.stage,
          toStage,
          body: body?.trim() ?? `Αλλαγή σταδίου σε ${toStage}`,
        },
      });
    });

    await this.audit.record('crm.lead.stage_changed', 'Lead', id, {
      fromStage: current.stage,
      toStage,
    });

    return this.getLead(id);
  }

  async addActivity(id: string, dto: CreateActivityDto) {
    const lead = await this.requireLead(id);
    const tenantId = this.ctx.tenantId;

    const activity = await this.prisma.$transaction(async (tx) => {
      const created = await tx.leadActivity.create({
        data: {
          tenantId,
          leadId: id,
          actorId: this.ctx.userId,
          type: dto.type,
          fromStage: dto.fromStage ?? lead.stage,
          toStage: dto.toStage,
          body: dto.body?.trim(),
        },
      });

      if (dto.toStage && dto.toStage !== lead.stage) {
        await tx.lead.update({
          where: { id },
          data: { stage: dto.toStage },
        });
      }

      return created;
    });

    await this.audit.record('crm.lead.activity_added', 'LeadActivity', activity.id, {
      leadId: id,
      type: dto.type,
    });

    return activity;
  }

  async convertLead(id: string, dto: ConvertLeadDto) {
    const tenantId = this.ctx.tenantId;
    const lead = await this.requireLead(id);

    if (lead.convertedStudentId) {
      throw new ConflictException('Ο υποψήφιος έχει ήδη μετατραπεί σε μαθητή');
    }

    const branchId = dto.branchId ?? lead.branchId;
    await this.requireBranch(branchId);

    const programId = dto.programId ?? lead.programId;
    if (!programId) {
      throw new BadRequestException('Απαιτείται πρόγραμμα σπουδών για την εγγραφή');
    }
    await this.requireProgram(programId);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Check student seat entitlement under row lock
      await this.entitlements.assertCanAddStudent(tx, tenantId);

      // 2. Resolve level
      let levelId = dto.levelId;
      if (!levelId) {
        const firstLevel = await tx.level.findFirst({
          where: { tenantId },
          orderBy: { sortOrder: 'asc' },
        });
        if (!firstLevel) {
          throw new BadRequestException('Δεν βρέθηκε επίπεδο σπουδών για το επιλεγμένο πρόγραμμα');
        }
        levelId = firstLevel.id;
      }

      // 3. Resolve active academic year
      const academicYearId = dto.academicYearId ?? (await this.activeYearId(tx));
      if (!academicYearId) {
        throw new BadRequestException('Δεν υπάρχει ενεργό ακαδημαϊκό έτος');
      }

      // 4. Generate registration number
      const registrationNumber =
        dto.registrationNumber?.trim() || (await this.nextRegistrationNumber(tx));

      // 5. Create student
      const student = await tx.student.create({
        data: {
          tenantId,
          branchId,
          registrationNumber,
          firstName: lead.studentFirstName,
          lastName: lead.studentLastName,
          birthDate: lead.birthDate,
          email: lead.contactEmail,
          phone: lead.contactPhone,
          notes: lead.notes,
          status: 'ACTIVE',
          enrolledAt: dto.enrolledAt ? new Date(dto.enrolledAt) : new Date(),
          consentData: dto.consentData ?? (lead.consentAt !== null),
          consentMedia: dto.consentMedia ?? false,
        },
      });

      // 6. Check if minor or parent relationship provided
      const isMinor =
        dto.isMinor ??
        (lead.birthDate
          ? new Date().getFullYear() - new Date(lead.birthDate).getFullYear() < 18
          : false);

      if (isMinor || lead.contactName !== `${lead.studentFirstName} ${lead.studentLastName}`) {
        const guardian = await tx.guardian.create({
          data: {
            tenantId,
            firstName: lead.contactName.split(' ')[0] || lead.contactName,
            lastName: lead.contactName.split(' ').slice(1).join(' ') || lead.studentLastName,
            email: lead.contactEmail,
            phone: lead.contactPhone,
          },
        });

        await tx.studentGuardian.create({
          data: {
            tenantId,
            studentId: student.id,
            guardianId: guardian.id,
            relationship: dto.guardianRelationship ?? lead.relationship ?? 'Γονέας',
            isPrimary: true,
          },
        });
      }

      // 7. Create enrollment
      const enrollment = await tx.enrollment.create({
        data: {
          tenantId,
          studentId: student.id,
          programId,
          levelId,
          academicYearId,
          branchId,
          teacherId: dto.teacherId,
          status: 'ACTIVE',
          enrolledAt: dto.enrolledAt ? new Date(dto.enrolledAt) : new Date(),
        },
      });

      // 8. Update lead to ENROLLED and link student
      const updatedLead = await tx.lead.update({
        where: { id },
        data: {
          stage: LeadStage.ENROLLED,
          convertedStudentId: student.id,
          convertedAt: new Date(),
        },
      });

      // 9. Record conversion activity
      await tx.leadActivity.create({
        data: {
          tenantId,
          leadId: id,
          actorId: this.ctx.userId,
          type: LeadActivityType.CONVERSION,
          fromStage: lead.stage,
          toStage: LeadStage.ENROLLED,
          body: `Επιτυχής μετατροπή σε μαθητή με Αριθμό Μητρώου ${registrationNumber}`,
        },
      });

      return { student, enrollment, lead: updatedLead };
    });

    await this.audit.record('crm.lead.converted', 'Lead', id, {
      studentId: result.student.id,
      registrationNumber: result.student.registrationNumber,
    });

    return result;
  }

  async deleteLead(id: string) {
    await this.requireLead(id);

    await this.prisma.lead.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: this.ctx.userId,
      },
    });

    await this.audit.record('crm.lead.deleted', 'Lead', id);
    return { success: true };
  }

  private async requireLead(id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId: this.ctx.tenantId, deletedAt: null },
    });
    if (!lead) throw new NotFoundException('Ο υποψήφιος δεν βρέθηκε');
    return lead;
  }

  private async requireBranch(id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!branch) throw new NotFoundException('Το παράρτημα δεν βρέθηκε');
    return branch;
  }

  private async requireProgram(id: string) {
    const program = await this.prisma.program.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!program) throw new NotFoundException('Το πρόγραμμα σπουδών δεν βρέθηκε');
    return program;
  }

  private async activeYearId(tx: Prisma.TransactionClient): Promise<string | null> {
    const year = await tx.academicYear.findFirst({
      where: { tenantId: this.ctx.tenantId, isActive: true },
      select: { id: true },
    });
    return year?.id ?? null;
  }

  private async nextRegistrationNumber(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `STU-${year}-`;
    const last = await tx.student.findFirst({
      where: {
        tenantId: this.ctx.tenantId,
        registrationNumber: { startsWith: prefix },
      },
      orderBy: { registrationNumber: 'desc' },
      select: { registrationNumber: true },
    });
    const lastSequence = last
      ? Number.parseInt(last.registrationNumber.slice(prefix.length), 10)
      : 0;
    return `${prefix}${String(Number.isFinite(lastSequence) ? lastSequence + 1 : 1).padStart(3, '0')}`;
  }
}
