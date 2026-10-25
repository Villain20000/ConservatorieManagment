import { BadRequestException } from '@nestjs/common';
import { PortalService } from './portal.service.js';

const TENANT_ID = 'tenant-1';
const CHILD_ID = 'student-child-1';

const studentRow = {
  id: CHILD_ID,
  firstName: 'Μαρία',
  lastName: 'Παπαδοπούλου',
  registrationNumber: 'S-001',
  branch: { id: 'branch-1', name: 'Κέντρο', city: 'Αθήνα' },
  enrollments: [],
};

function createService(options: {
  isGuardian: boolean;
  childIds?: string[];
  assertAccessible?: (studentId: string) => Promise<void>;
  studentId?: string | null;
} = { isGuardian: false }) {
  const { isGuardian, childIds = [CHILD_ID] } = options;
  const prisma = {
    student: { findFirst: vi.fn().mockResolvedValue(studentRow) },
    lesson: { findFirst: vi.fn().mockResolvedValue(null) },
    attendance: { groupBy: vi.fn().mockResolvedValue([]) },
    charge: { findMany: vi.fn().mockResolvedValue([]) },
    examResult: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const ctx = { tenantId: TENANT_ID };
  const scope = {
    isGuardian,
    guardianChildIds: vi.fn().mockResolvedValue(childIds),
    assertStudentAccessible: vi.fn(
      options.assertAccessible ??
        (async (studentId: string) => {
          if (isGuardian && !childIds.includes(studentId)) {
            const { NotFoundException } = await import('@nestjs/common');
            throw new NotFoundException('Ο μαθητής δεν βρέθηκε');
          }
        }),
    ),
    requireStudentId: vi.fn().mockResolvedValue(options.studentId ?? CHILD_ID),
  };
  const service = new PortalService(prisma as any, ctx as any, scope as any, {} as any);
  return { service, prisma, scope };
}

describe('PortalService overview (guardian-aware)', () => {
  it('resolves the single linked child without an explicit studentId', async () => {
    const { service, prisma, scope } = createService({ isGuardian: true });

    const overview = await service.overview();

    expect(scope.guardianChildIds).toHaveBeenCalled();
    expect(prisma.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CHILD_ID, tenantId: TENANT_ID } }),
    );
    expect(overview.student.id).toBe(CHILD_ID);
    expect(overview.attendance).toEqual({ total: 0, rate: null });
    expect(overview.finance).toEqual({ outstandingCents: 0, outstanding: 0 });
  });

  it('requires an explicit studentId when the guardian has several children', async () => {
    const { service } = createService({
      isGuardian: true,
      childIds: ['child-1', 'child-2'],
    });

    const failure = await service.overview().then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(BadRequestException);
    expect((failure as BadRequestException).getResponse()).toMatchObject({
      code: 'PORTAL_STUDENT_REQUIRED',
    });
  });

  it('rejects a guardian reading an unlinked student', async () => {
    const { service, scope } = createService({ isGuardian: true });

    await expect(service.overview('unlinked-student')).rejects.toThrow('Ο μαθητής δεν βρέθηκε');
    expect(scope.assertStudentAccessible).toHaveBeenCalledWith('unlinked-student');
  });

  it('computes attendance rate and outstanding balance', async () => {
    const { service, prisma } = createService({ isGuardian: false });
    prisma.attendance.groupBy.mockResolvedValue([
      { status: 'PRESENT', _count: { _all: 8 } },
      { status: 'ABSENT', _count: { _all: 2 } },
    ]);
    prisma.charge.findMany.mockResolvedValue([
      { amountCents: 10000, paidAmountCents: 4000 },
      { amountCents: 5000, paidAmountCents: 5000 },
    ]);

    const overview = await service.overview(CHILD_ID);

    expect(overview.attendance).toEqual({ total: 10, rate: 80 });
    expect(overview.finance).toEqual({ outstandingCents: 6000, outstanding: 60 });
  });
});
