import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../common/audit.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { IntelligenceService } from './intelligence.service.js';

describe('Intelligent Automation (Human-in-the-Loop) Service', () => {
  let service: IntelligenceService;
  let prisma: any;
  let ctx: any;
  let audit: any;

  const tenantId = '00000000-0000-7000-0000-000000000001';
  const userId = '00000000-0000-7000-0000-000000000099';
  const studentId = '00000000-0000-7000-0000-000000000010';
  const teacherId = '00000000-0000-7000-0000-000000000020';

  beforeEach(() => {
    prisma = {
      student: { count: vi.fn(), findFirst: vi.fn() },
      teacher: { findFirst: vi.fn() },
      lesson: { count: vi.fn(), findFirst: vi.fn() },
      attendance: { findMany: vi.fn() },
      lead: { count: vi.fn() },
      charge: { findMany: vi.fn() },
      event: { findMany: vi.fn() },
      exam: { findMany: vi.fn() },
      dailyDigest: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      pedagogicalRecommendation: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      lessonStudent: { findFirst: vi.fn() },
    };
    ctx = { tenantId, userId };
    audit = { record: vi.fn().mockResolvedValue(undefined) };

    service = new IntelligenceService(
      prisma as unknown as PrismaService,
      ctx as unknown as TenantContextService,
      audit as unknown as AuditService,
    );
  });

  describe('generateDailyDigest', () => {
    it('aggregates daily metrics and synthesizes draft administrative digest', async () => {
      prisma.student.count.mockResolvedValue(120);
      prisma.lesson.count.mockResolvedValue(18);
      prisma.attendance.findMany.mockResolvedValue([
        { status: 'PRESENT' },
        { status: 'PRESENT' },
        { status: 'ABSENT' },
      ]);
      prisma.lead.count.mockResolvedValue(5);
      prisma.charge.findMany.mockResolvedValue([
        { amountCents: 15000, paidAmountCents: 0 },
      ]);
      prisma.event.findMany.mockResolvedValue([
        { title: 'Spring Recital', startsAt: new Date(), category: 'RECITAL' },
      ]);
      prisma.exam.findMany.mockResolvedValue([]);
      prisma.dailyDigest.findFirst.mockResolvedValue(null);
      prisma.dailyDigest.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          ...data,
          id: 'digest-1',
          createdAt: new Date(),
        }),
      );

      const result = await service.generateDailyDigest();

      expect(result.id).toBe('digest-1');
      expect(result.status).toBe('DRAFT');
      expect(result.contentMarkdown).toContain('120');
      expect(result.contentMarkdown).toContain('Spring Recital');
      expect(result.contentMarkdown).toContain('150.00 €');
      expect(audit.record).toHaveBeenCalledWith(
        'intelligence.digest_generated',
        'DailyDigest',
        'digest-1',
        expect.any(Object),
      );
    });
  });

  describe('reviewDailyDigest', () => {
    it('approves draft digest and records reviewer metadata', async () => {
      prisma.dailyDigest.findFirst.mockResolvedValue({
        id: 'digest-1',
        tenantId,
        status: 'DRAFT',
        contentMarkdown: 'Original draft',
      });
      prisma.dailyDigest.update.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'digest-1',
          status: data.status,
          contentMarkdown: data.contentMarkdown,
          reviewedById: userId,
          reviewedAt: new Date(),
        }),
      );

      const result = await service.reviewDailyDigest('digest-1', {
        action: 'APPROVE',
        contentMarkdown: 'Approved executive digest',
      });

      expect(result.status).toBe('APPROVED');
      expect(result.contentMarkdown).toBe('Approved executive digest');
      expect(audit.record).toHaveBeenCalledWith(
        'intelligence.digest_reviewed',
        'DailyDigest',
        'digest-1',
        { action: 'APPROVE', status: 'APPROVED' },
      );
    });
  });

  describe('pedagogical recommendations', () => {
    it('creates recommendation in PENDING_REVIEW and allows teacher review', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: studentId });
      prisma.teacher.findFirst.mockResolvedValue({ id: teacherId });
      prisma.pedagogicalRecommendation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'rec-1', createdAt: new Date() }),
      );

      const created = await service.createRecommendation({
        studentId,
        teacherId,
        title: 'Thumb mobility and scale velocity',
        category: 'TECHNIQUE',
        rationale: 'Struggles with smooth thumb-under transition in Czerny Op. 599',
        prescribedExercises: [
          { name: 'Hanon No. 1', description: 'Metronome at 80-100 BPM', dailyMinutes: 10 },
        ],
      });

      expect(created.id).toBe('rec-1');
      expect(created.status).toBe('PENDING_REVIEW');

      // Now teacher reviews and approves
      prisma.pedagogicalRecommendation.findFirst.mockResolvedValue(created);
      prisma.pedagogicalRecommendation.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...created, ...data, reviewedAt: new Date() }),
      );

      const reviewed = await service.reviewRecommendation('rec-1', {
        status: 'APPROVED',
        teacherFeedback: 'Excellent exercise set, practice 15 min daily before repertoire.',
      });

      expect(reviewed.status).toBe('APPROVED');
      expect(reviewed.teacherFeedback).toContain('Excellent exercise set');
    });
  });

  describe('explainConflict', () => {
    it('diagnoses room conflict and computes alternative conflict-free candidate slots', async () => {
      prisma.lesson.findFirst
        .mockResolvedValueOnce({
          id: 'les-competing',
          startsAt: new Date('2026-10-27T16:00:00Z'),
          endsAt: new Date('2026-10-27T17:00:00Z'),
          teacher: { firstName: 'Dimitrios', lastName: 'Mitropoulos' },
          room: { name: 'Chamber Hall 1' },
        }) // Room collision
        .mockResolvedValueOnce(null); // Teacher no collision

      const result = await service.explainConflict({
        startsAt: '2026-10-27T16:30:00Z',
        endsAt: '2026-10-27T17:30:00Z',
        roomId: 'room-1',
        teacherId,
        branchId: 'branch-1',
      });

      expect(result.hasConflict).toBe(true);
      expect(result.conflicts[0].type).toBe('ROOM');
      expect(result.conflicts[0].explanation).toContain('Dimitrios Mitropoulos');
      expect(result.suggestedSlots.length).toBeGreaterThanOrEqual(1);
    });
  });
});
