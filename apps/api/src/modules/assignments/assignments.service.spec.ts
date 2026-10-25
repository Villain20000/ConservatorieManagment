import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssignmentsService } from './assignments.service.js';

function createHarness() {
  const prisma = {
    assignment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    assignmentTarget: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    assignmentSubmission: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    student: { findMany: vi.fn() },
    $transaction: vi.fn(async (work: unknown) =>
      typeof work === 'function' ? (work as (tx: unknown) => unknown)(prisma) : work,
    ),
  };
  const ctx = { tenantId: 'tenant-1', userId: 'user-1' };
  const scope = {
    isTeacher: false,
    isGuardian: false,
    requireTeacherId: vi.fn(async () => 'teacher-1'),
    requireStudentId: vi.fn(async () => 'student-1'),
    assertStudentAccessible: vi.fn(),
    guardianChildIds: vi.fn(async () => []),
  };
  const audit = { record: vi.fn() };
  const notifications = { createForUsers: vi.fn() };
  const service = new AssignmentsService(
    prisma as never,
    ctx as never,
    scope as never,
    audit as never,
    notifications as never,
  );
  return { prisma, ctx, scope, audit, notifications, service };
}

const ASSIGNMENT = {
  id: 'assignment-1',
  tenantId: 'tenant-1',
  title: 'Κλίμακες',
  status: 'ACTIVE',
  teacherId: 'teacher-1',
  assignedOn: new Date('2026-10-20'),
};

describe('AssignmentsService guards', () => {
  it('rejects a teacher targeting students they do not teach', async () => {
    const { prisma, scope, service } = createHarness();
    scope.isTeacher = true;
    prisma.student.findMany.mockResolvedValue([{ id: 'student-1' }]);
    await expect(
      service.create({
        title: 'Εργασία',
        studentIds: ['student-1', 'student-foreign'],
        assignedOn: '2026-10-20',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scopes the staff list to the teacher owning the assignment', async () => {
    const { prisma, scope, service } = createHarness();
    scope.isTeacher = true;
    prisma.assignment.findMany.mockResolvedValue([]);
    await service.list({});
    expect(prisma.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1', teacherId: 'teacher-1' }),
      }),
    );
  });

  it('hides another teacher’s assignment as 404, not 403', async () => {
    const { prisma, scope, service } = createHarness();
    scope.isTeacher = true;
    prisma.assignment.findFirst.mockResolvedValue({
      ...ASSIGNMENT,
      teacherId: 'teacher-other',
    });
    await expect(service.get('assignment-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects submission to a cancelled assignment', async () => {
    const { prisma, service } = createHarness();
    prisma.assignment.findFirst.mockResolvedValue({ ...ASSIGNMENT, status: 'CANCELLED' });
    prisma.assignmentTarget.findFirst.mockResolvedValue({ id: 'target-1' });
    await expect(service.submit('assignment-1', { content: '…' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects submission by a student who is not targeted', async () => {
    const { prisma, service } = createHarness();
    prisma.assignment.findFirst.mockResolvedValue(ASSIGNMENT);
    prisma.assignmentTarget.findFirst.mockResolvedValue(null);
    await expect(service.submit('assignment-1', { content: '…' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('blocks re-submission after grading', async () => {
    const { prisma, service } = createHarness();
    prisma.assignment.findFirst.mockResolvedValue(ASSIGNMENT);
    prisma.assignmentTarget.findFirst.mockResolvedValue({ id: 'target-1' });
    prisma.assignmentSubmission.findFirst.mockResolvedValue({ id: 'sub-1', status: 'GRADED' });
    await expect(service.submit('assignment-1', { content: '…' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects grading a submission that was never submitted', async () => {
    const { prisma, scope, service } = createHarness();
    scope.isTeacher = true;
    prisma.assignmentSubmission.findFirst.mockResolvedValue({
      id: 'sub-1',
      studentId: 'student-1',
      submittedAt: null,
      assignment: { id: 'assignment-1', teacherId: 'teacher-1', title: 'x', status: 'ACTIVE' },
    });
    await expect(service.grade('assignment-1', 'sub-1', { grade: 90 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses grading another teacher’s submission as 404', async () => {
    const { prisma, scope, service } = createHarness();
    scope.isTeacher = true;
    prisma.assignmentSubmission.findFirst.mockResolvedValue({
      id: 'sub-1',
      studentId: 'student-1',
      submittedAt: new Date(),
      assignment: { id: 'assignment-1', teacherId: 'teacher-other', title: 'x', status: 'ACTIVE' },
    });
    await expect(service.grade('assignment-1', 'sub-1', { grade: 90 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('grades successfully and notifies the student', async () => {
    const { prisma, scope, audit, notifications, service } = createHarness();
    scope.isTeacher = true;
    prisma.assignmentSubmission.findFirst.mockResolvedValue({
      id: 'sub-1',
      studentId: 'student-1',
      submittedAt: new Date(),
      student: { userId: 'student-user-1' },
      assignment: { id: 'assignment-1', teacherId: 'teacher-1', title: 'Κλίμακες', status: 'ACTIVE' },
    });
    prisma.assignmentSubmission.update.mockResolvedValue({ id: 'sub-1', status: 'GRADED' });
    await service.grade('assignment-1', 'sub-1', { grade: 92, feedback: 'Πολύ καλά' });
    expect(prisma.assignmentSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ grade: 92, status: 'GRADED' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      'assignment.graded',
      'AssignmentSubmission',
      'sub-1',
      expect.anything(),
    );
    expect(notifications.createForUsers).toHaveBeenCalled();
  });

  it('submits an ungraded resubmission as a new SUBMITTED row state', async () => {
    const { prisma, service } = createHarness();
    prisma.assignment.findFirst.mockResolvedValue(ASSIGNMENT);
    prisma.assignmentTarget.findFirst.mockResolvedValue({ id: 'target-1' });
    prisma.assignmentSubmission.findFirst.mockResolvedValue({
      id: 'sub-1',
      status: 'RETURNED',
    });
    prisma.assignmentSubmission.update.mockResolvedValue({ id: 'sub-1', status: 'SUBMITTED' });
    await service.submit('assignment-1', { content: 'διόρθωση' });
    expect(prisma.assignmentSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ status: 'SUBMITTED', submittedAt: expect.any(Date) }),
      }),
    );
  });
});
