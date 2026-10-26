import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeadActivityType, LeadSource, LeadStage } from '../../generated/prisma/enums.js';
import { CrmService } from './crm.service.js';

const TENANT_ID = '01918a24-1111-7000-8000-000000000001';
const USER_ID = '01918a24-2222-7000-8000-000000000002';
const BRANCH_ID = '01918a24-3333-7000-8000-000000000003';
const PROGRAM_ID = '01918a24-4444-7000-8000-000000000004';
const LEVEL_ID = '01918a24-5555-7000-8000-000000000005';
const ACADEMIC_YEAR_ID = '01918a24-6666-7000-8000-000000000006';

function createService() {
  const prisma: any = {
    lead: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    leadActivity: {
      create: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    program: {
      findFirst: vi.fn(),
    },
    level: {
      findFirst: vi.fn(),
    },
    academicYear: {
      findFirst: vi.fn(),
    },
    student: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    guardian: {
      create: vi.fn(),
    },
    studentGuardian: {
      create: vi.fn(),
    },
    enrollment: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prisma)),
  };

  const ctx: any = {
    tenantId: TENANT_ID,
    userId: USER_ID,
  };

  const audit: any = {
    record: vi.fn().mockResolvedValue(undefined),
  };

  const entitlements: any = {
    assertCanAddStudent: vi.fn().mockResolvedValue(undefined),
  };

  const service = new CrmService(prisma, ctx, audit, entitlements);
  return { service, prisma, ctx, audit, entitlements };
}

describe('CrmService', () => {
  let setup: ReturnType<typeof createService>;

  beforeEach(() => {
    setup = createService();
  });

  it('lists leads with tenant isolation', async () => {
    const { service, prisma } = setup;
    prisma.lead.count.mockResolvedValue(1);
    prisma.lead.findMany.mockResolvedValue([
      {
        id: 'lead-1',
        studentFirstName: 'Νίκος',
        studentLastName: 'Παπαδόπουλος',
        stage: LeadStage.NEW,
        branch: { id: BRANCH_ID, name: 'Κεντρικό', code: 'CEN' },
        program: { id: PROGRAM_ID, name: 'Πιάνο', color: '#6366f1' },
      },
    ]);

    const result = await service.listLeads({ page: 1, pageSize: 10, skip: 0 } as any);
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_ID, deletedAt: null }),
      }),
    );
  });

  it('throws NotFoundException when lead is not found or from another tenant', async () => {
    const { service, prisma } = setup;
    prisma.lead.findFirst.mockResolvedValue(null);

    await expect(service.getLead('non-existent')).rejects.toThrow(NotFoundException);
  });

  it('creates a new lead with initial activity and audit log', async () => {
    const { service, prisma, audit } = setup;
    prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID });
    prisma.program.findFirst.mockResolvedValue({ id: PROGRAM_ID });
    prisma.lead.create.mockResolvedValue({
      id: 'lead-new',
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      studentFirstName: 'Μαρία',
      studentLastName: 'Γεωργίου',
      contactName: 'Ελένη Γεωργίου',
      stage: LeadStage.NEW,
      source: LeadSource.WEB_FORM,
    });
    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead-new',
      studentFirstName: 'Μαρία',
      studentLastName: 'Γεωργίου',
      activities: [],
    });

    const lead = await service.createLead({
      branchId: BRANCH_ID,
      studentFirstName: 'Μαρία',
      studentLastName: 'Γεωργίου',
      contactName: 'Ελένη Γεωργίου',
      programId: PROGRAM_ID,
    });

    expect(lead.id).toBe('lead-new');
    expect(prisma.lead.create).toHaveBeenCalled();
    expect(prisma.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          leadId: 'lead-new',
          type: LeadActivityType.NOTE,
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      'crm.lead.created',
      'Lead',
      'lead-new',
      expect.any(Object),
    );
  });

  it('changes stage and logs activity', async () => {
    const { service, prisma, audit } = setup;
    prisma.lead.findFirst
      .mockResolvedValueOnce({
        id: 'lead-1',
        tenantId: TENANT_ID,
        stage: LeadStage.NEW,
      })
      .mockResolvedValueOnce({
        id: 'lead-1',
        stage: LeadStage.CONTACTED,
      });

    await service.changeStage('lead-1', LeadStage.CONTACTED, 'Τηλεφωνική επικοινωνία');

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { stage: LeadStage.CONTACTED, lostReason: null },
    });
    expect(prisma.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStage: LeadStage.NEW,
          toStage: LeadStage.CONTACTED,
          type: LeadActivityType.STAGE_CHANGE,
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      'crm.lead.stage_changed',
      'Lead',
      'lead-1',
      expect.any(Object),
    );
  });

  it('converts lead into student and enrollment transactionally', async () => {
    const { service, prisma, entitlements, audit } = setup;
    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      programId: PROGRAM_ID,
      studentFirstName: 'Άννα',
      studentLastName: 'Δημητρίου',
      contactName: 'Κώστας Δημητρίου',
      contactPhone: '6900000000',
      contactEmail: 'kostas@example.com',
      birthDate: new Date('2015-05-10'),
      relationship: 'Πατέρας',
      stage: LeadStage.OFFER_SENT,
      convertedStudentId: null,
    });
    prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID });
    prisma.program.findFirst.mockResolvedValue({ id: PROGRAM_ID });
    prisma.level.findFirst.mockResolvedValue({ id: LEVEL_ID });
    prisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
    prisma.student.findFirst.mockResolvedValue(null);
    prisma.student.create.mockResolvedValue({
      id: 'student-1',
      registrationNumber: 'STU-2026-001',
    });
    prisma.guardian.create.mockResolvedValue({ id: 'guardian-1' });
    prisma.enrollment.create.mockResolvedValue({ id: 'enrollment-1' });
    prisma.lead.update.mockResolvedValue({ id: 'lead-1', stage: LeadStage.ENROLLED });

    const result = await service.convertLead('lead-1', {
      programId: PROGRAM_ID,
      levelId: LEVEL_ID,
    });

    expect(entitlements.assertCanAddStudent).toHaveBeenCalled();
    expect(prisma.student.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          firstName: 'Άννα',
          lastName: 'Δημητρίου',
          status: 'ACTIVE',
        }),
      }),
    );
    expect(prisma.guardian.create).toHaveBeenCalled();
    expect(prisma.studentGuardian.create).toHaveBeenCalled();
    expect(prisma.enrollment.create).toHaveBeenCalled();
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          stage: LeadStage.ENROLLED,
          convertedStudentId: 'student-1',
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      'crm.lead.converted',
      'Lead',
      'lead-1',
      expect.any(Object),
    );
    expect(result.student.id).toBe('student-1');
  });

  it('rejects duplicate conversion with ConflictException', async () => {
    const { service, prisma } = setup;
    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      tenantId: TENANT_ID,
      convertedStudentId: 'student-existing',
    });

    await expect(service.convertLead('lead-1', {})).rejects.toThrow(ConflictException);
  });
});
