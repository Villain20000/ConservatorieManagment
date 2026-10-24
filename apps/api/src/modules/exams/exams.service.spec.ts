import { BadRequestException, ConflictException } from '@nestjs/common';
import { ExamsService } from './exams.service.js';

function createHarness() {
  const prisma = {
    exam: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    examPeriod: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    examCommitteeMember: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    examApplication: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    examResult: { findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    program: { findFirst: vi.fn() },
    level: { findFirst: vi.fn() },
    student: { findFirst: vi.fn(), findMany: vi.fn() },
    enrollment: { findFirst: vi.fn(), findMany: vi.fn() },
    teacher: { findMany: vi.fn() },
    lessonSeriesStudent: { findMany: vi.fn() },
    $transaction: vi.fn(async (work: unknown) =>
      typeof work === 'function' ? (work as (tx: unknown) => unknown)(prisma) : work,
    ),
  };
  const ctx = { tenantId: 'tenant-1', userId: 'user-1' };
  const scope = {
    isTeacher: false,
    requireTeacherId: vi.fn(),
    assertStudentAccessible: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const service = new ExamsService(
    prisma as never,
    ctx as never,
    scope as never,
    audit as never,
    {} as never,
    {} as never,
    { ensureExamRecord: vi.fn() } as never,
  );
  return { prisma, ctx, scope, audit, service };
}

const SCHEDULED_EXAM = {
  id: 'exam-1',
  status: 'SCHEDULED',
  programId: 'program-1',
  levelId: null,
  periodId: null,
};

describe('ExamsService guards', () => {
  it('rejects an exam period whose end precedes its start', async () => {
    const { prisma, service } = createHarness();
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'year-1' });
    await expect(
      service.createPeriod({
        academicYearId: 'year-1',
        name: 'Ιούνιος',
        startsOn: '2026-06-10',
        endsOn: '2026-06-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.examPeriod.create).not.toHaveBeenCalled();
  });

  it('rejects a committee assigning two roles to the same teacher', async () => {
    const { prisma, service } = createHarness();
    prisma.exam.findFirst.mockResolvedValue(SCHEDULED_EXAM);
    await expect(
      service.setCommittee('exam-1', {
        members: [
          { teacherId: 'teacher-1', role: 'PRESIDENT' },
          { teacherId: 'teacher-1', role: 'EXAMINER' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a committee with two presidents', async () => {
    const { prisma, service } = createHarness();
    prisma.exam.findFirst.mockResolvedValue(SCHEDULED_EXAM);
    await expect(
      service.setCommittee('exam-1', {
        members: [
          { teacherId: 'teacher-1', role: 'PRESIDENT' },
          { teacherId: 'teacher-2', role: 'PRESIDENT' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-final application decision', async () => {
    const { prisma, service } = createHarness();
    prisma.exam.findFirst.mockResolvedValue(SCHEDULED_EXAM);
    prisma.examApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      status: 'PENDING',
      student: { id: 'student-1', userId: null },
      exam: { id: 'exam-1', title: 'Εξετάσεις' },
    });
    await expect(
      service.decideApplication('exam-1', 'app-1', { status: 'PENDING' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects saving an empty result batch', async () => {
    const { prisma, service } = createHarness();
    prisma.exam.findFirst.mockResolvedValue(SCHEDULED_EXAM);
    await expect(service.saveResults('exam-1', { results: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('locks updates on closed exams', async () => {
    const { prisma, service } = createHarness();
    prisma.exam.findFirst.mockResolvedValue({ ...SCHEDULED_EXAM, status: 'PUBLISHED' });
    await expect(service.update('exam-1', { title: 'Νέος τίτλος' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EXAM_LOCKED' }),
    });
  });

  it('refuses to cancel a published exam', async () => {
    const { prisma, service } = createHarness();
    prisma.exam.findFirst.mockResolvedValue({ ...SCHEDULED_EXAM, status: 'PUBLISHED' });
    await expect(service.cancel('exam-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires submitted results before approval', async () => {
    const { prisma, service } = createHarness();
    prisma.exam.findFirst.mockResolvedValue({ ...SCHEDULED_EXAM, status: 'GRADING' });
    await expect(service.approveResults('exam-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EXAM_NOT_SUBMITTED' }),
    });
  });

  it('requires approval before publishing', async () => {
    const { prisma, service } = createHarness();
    prisma.exam.findFirst.mockResolvedValue({ ...SCHEDULED_EXAM, status: 'GRADING' });
    await expect(service.publish('exam-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EXAM_NOT_APPROVED' }),
    });
  });
});
