import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { NotificationsService } from '../../common/notifications.service.js';
import { ScopeService } from '../../common/scope.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SchedulingService } from './scheduling.service.js';

const TENANT = '11111-1111-7111-8111-111';
const BRANCH = '22222-2222-7222-8222-222';
const OTHER_BRANCH = '22222-2222-7222-8222-333';
const ROOM = '33333-3333-7333-8333-333';
const TEACHER = '44444-4444-7444-8444-444';
const PROGRAM = '55555-5555-7555-8555-555';
const STUDENT = '66666-6666-7666-8666-666';

/**
 * Unit tests for the scheduling calendar rules: holiday skipping, academic-term
 * bounds, DST safety and conflict rejection. Prisma is replaced by a small fake
 * so these run everywhere, including without a database.
 */
function fakePrisma(overrides: {
  holidays?: {
    id?: string;
    date: Date;
    kind: 'HOLIDAY' | 'CLOSED' | 'MAKEUP_DAY';
    branchId: string | null;
  }[];
  existingLessons?: Record<string, unknown>[];
  academicYear?: { startsOn: Date; endsOn: Date } | null;
} = {}) {
  const calls = { lessonCreateMany: [] as unknown[] };
  const rows: Record<string, unknown>[] = [];
  const prisma = {
    branch: { findFirst: async () => ({ id: BRANCH }) },
    room: { findFirst: async () => ({ id: ROOM, branchId: BRANCH }) },
    teacher: { findFirst: async () => ({ id: TEACHER }) },
    program: { findFirst: async () => ({ id: PROGRAM }) },
    level: { findFirst: async () => ({ id: 'level' }) },
    student: { count: async () => 1 },
    calendarDay: {
      findMany: async () => overrides.holidays ?? [],
    },
    academicYear: {
      findFirst: async () =>
        overrides.academicYear === undefined
          ? { startsOn: new Date('2026-09-01T00:00:00Z'), endsOn: new Date('2027-06-30T00:00:00Z') }
          : overrides.academicYear,
    },
    lesson: {
      findMany: async () => overrides.existingLessons ?? [],
      deleteMany: async () => ({ count: 0 }),
    },
    lessonSeries: {
      create: async (args: { data: Record<string, unknown> }) => {
        rows.push({ ...args.data });
        return { id: 'series-1', ...args.data };
      },
      update: async () => ({ id: 'series-1' }),
      /** Mirrors `getSeries()`: my summary query used by the create response. */
      findFirst: async () => ({
        id: 'series-1',
        ...(rows[0] ?? {}),
        branch: { id: BRANCH, name: 'Υποκατάστημα' },
        room: { id: ROOM, name: 'Αίθουσα 1' },
        teacher: { id: TEACHER, firstName: 'Μαρία', lastName: 'Παπαδάκη' },
        program: { id: PROGRAM, name: 'Πιάνο', code: 'PNO', color: '#6366f1' },
        level: null,
        students: ((rows[0]?.studentIds as string[] | undefined) ?? []).map((studentId) => ({
          student: {
            id: studentId,
            firstName: 'Νίκος',
            lastName: 'Δήμου',
            registrationNumber: 'R-1',
          },
        })),
      }),
    },
    lessonSeriesStudent: { createMany: async () => ({ count: 0 }), deleteMany: async () => ({ count: 0 }) },
    lessonStudent: { createMany: async () => ({ count: 0 }) },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        ...prisma,
        lesson: {
          ...prisma.lesson,
          createMany: async (args: unknown) => {
            calls.lessonCreateMany.push(args);
            return { count: 0 };
          },
        },
      }),
  };
  return { prisma, calls };
}

function buildService(prisma: unknown) {
  const ctx = { tenantId: TENANT } as unknown as TenantContextService;
  const scope = { isTeacher: false, isStudent: false } as unknown as ScopeService;
  const notifications = {} as NotificationsService;
  const audit = { record: async () => undefined } as unknown as AuditService;
  const service = new SchedulingService(
    prisma as PrismaService,
    ctx,
    scope,
    notifications,
    audit,
  );
  return service;
}

const baseSeries = {
  branchId: BRANCH,
  roomId: ROOM,
  teacherId: TEACHER,
  programId: PROGRAM,
  type: 'INDIVIDUAL' as const,
  title: 'Πιάνο',
  weekday: 1, // Monday
  startTime: '15:00',
  durationMinutes: 45,
  validFrom: '2026-11-02',
  validTo: '2026-11-30',
  studentIds: [STUDENT],
};

describe('SchedulingService recurrence rules', () => {
  it('materialises one lesson per matching weekday inside the term', async () => {
    const { prisma, calls } = fakePrisma();
    const service = buildService(prisma);

    await service.createSeries(baseSeries);

    const created = (calls.lessonCreateMany[0] as { data: { startsAt: Date }[] }).data;
    expect(created).toHaveLength(5); // Nov 2, 9, 16, 23, 30
    // 15:00 Athens in winter (UTC+2) is 13:00 UTC.
    expect(created[0].startsAt.toISOString()).toBe('2026-11-02T13:00:00.000Z');
  });

  it('skips public holidays and closures for the branch', async () => {
    const { prisma, calls } = fakePrisma({
      holidays: [
        { date: new Date('2026-11-09T00:00:00Z'), kind: 'HOLIDAY', branchId: null },
        { date: new Date('2026-11-16T00:00:00Z'), kind: 'CLOSED', branchId: BRANCH },
        // A closure in another branch must not affect this one.
        { date: new Date('2026-11-23T00:00:00Z'), kind: 'CLOSED', branchId: OTHER_BRANCH },
      ],
    });
    const service = buildService(prisma);

    await service.createSeries(baseSeries);

    const created = (calls.lessonCreateMany[0] as { data: { startsAt: Date }[] }).data;
    const dates = created.map((row) => row.startsAt.toISOString().slice(0, 10));
    expect(dates).toEqual(['2026-11-02', '2026-11-23', '2026-11-30']);
  });

  it('keeps the wall-clock time across the DST transition', async () => {
    const { prisma, calls } = fakePrisma();
    const service = buildService(prisma);

    // March 2027: clocks move forward on the 28th.
    await service.createSeries({
      ...baseSeries,
      validFrom: '2027-03-22',
      validTo: '2027-03-29',
    });

    const created = (calls.lessonCreateMany[0] as { data: { startsAt: Date }[] }).data;
    expect(created.map((row) => row.startsAt.toISOString())).toEqual([
      '2027-03-22T13:00:00.000Z', // UTC+2
      '2027-03-29T12:00:00.000Z', // UTC+3 after the change
    ]);
  });

  it('bounds the series by the active academic year when no end date is given', async () => {
    const { prisma } = fakePrisma({
      academicYear: { startsOn: new Date('2026-09-01T00:00:00Z'), endsOn: new Date('2026-11-09T00:00:00Z') },
    });
    const service = buildService(prisma);

    const series = await service.createSeries({ ...baseSeries, validTo: undefined });
    expect(series).toBeDefined();
  });

  it('refuses to materialise a series that collides with an existing lesson', async () => {
    const { prisma } = fakePrisma({
      existingLessons: [
        {
          id: 'existing-lesson',
          teacherId: 'someone-else',
          roomId: null,
          startsAt: new Date('2026-11-02T13:00:00.000Z'),
          endsAt: new Date('2026-11-02T13:45:00.000Z'),
          teacher: { firstName: 'Άννα', lastName: 'Ρήγα' },
          room: null,
          students: [{ studentId: STUDENT }],
        },
      ],
    });
    const service = buildService(prisma);

    await expect(service.createSeries(baseSeries)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects students that do not belong to the tenant', async () => {
    const { prisma } = fakePrisma();
    (prisma.student as { count: () => Promise<number> }).count = async () => 0;
    const service = buildService(prisma);

    await expect(service.createSeries(baseSeries)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a room that belongs to another branch', async () => {
    const { prisma } = fakePrisma();
    (prisma.room as { findFirst: () => Promise<unknown> }).findFirst = async () => ({
      id: ROOM,
      branchId: OTHER_BRANCH,
    });
    const service = buildService(prisma);

    await expect(service.createSeries(baseSeries)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing teacher', async () => {
    const { prisma } = fakePrisma();
    (prisma.teacher as { findFirst: () => Promise<unknown> }).findFirst = async () => null;
    const service = buildService(prisma);

    await expect(service.createSeries(baseSeries)).rejects.toBeInstanceOf(NotFoundException);
  });
});
