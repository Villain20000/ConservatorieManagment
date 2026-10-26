import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../common/audit.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PracticeService } from './practice.service.js';

describe('Practice Engagement Analytics Service', () => {
  let service: PracticeService;
  let prisma: any;
  let ctx: any;
  let audit: any;

  const tenantId = '00000000-0000-7000-0000-000000000001';
  const studentId = '00000000-0000-7000-0000-000000000010';
  const userId = '00000000-0000-7000-0000-000000000099';

  beforeEach(() => {
    prisma = {
      student: {
        findFirst: vi.fn(),
      },
      practiceSession: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };
    ctx = { tenantId, userId };
    audit = { record: vi.fn().mockResolvedValue(undefined) };

    service = new PracticeService(
      prisma as unknown as PrismaService,
      ctx as unknown as TenantContextService,
      audit as unknown as AuditService,
    );
  });

  describe('logSession', () => {
    it('throws NotFoundException if student cannot be resolved', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(
        service.logSession({
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMinutes: 45,
          instrument: 'Piano',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates practice session and records audit event', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: studentId });
      prisma.practiceSession.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          ...data,
          id: 'sess-1',
          student: {
            id: studentId,
            firstName: 'Maria',
            lastName: 'Kallas',
            registrationNumber: 'AM-100',
          },
        }),
      );

      const result = await service.logSession({
        studentId,
        startedAt: '2026-10-26T18:00:00Z',
        endedAt: '2026-10-26T18:45:00Z',
        durationMinutes: 45,
        instrument: 'Violin',
        pieceTitle: 'Kreutzer Etude No. 2',
        tempoBpm: 104,
        rating: 4,
        metrics: { toolUsed: 'metronome', loopsCount: 8 },
      });

      expect(result.id).toBe('sess-1');
      expect(result.durationMinutes).toBe(45);
      expect(result.instrument).toBe('Violin');
      expect(prisma.practiceSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId,
            studentId,
            durationMinutes: 45,
            instrument: 'Violin',
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        'practice.session_logged',
        'PracticeSession',
        'sess-1',
        expect.objectContaining({
          studentId,
          durationMinutes: 45,
        }),
      );
    });
  });

  describe('getAnalytics', () => {
    it('computes total minutes, weekly goal rate, and daily streaks', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: studentId });

      const today = new Date();
      const yesterday = new Date(today.getTime() - 86400000);
      const twoDaysAgo = new Date(today.getTime() - 86400000 * 2);

      prisma.practiceSession.findMany.mockResolvedValue([
        {
          id: 's1',
          startedAt: today,
          durationMinutes: 45,
          instrument: 'Piano',
        },
        {
          id: 's2',
          startedAt: yesterday,
          durationMinutes: 45,
          instrument: 'Piano',
        },
        {
          id: 's3',
          startedAt: twoDaysAgo,
          durationMinutes: 30,
          instrument: 'Violin',
        },
      ]);

      const analytics = await service.getAnalytics(studentId);

      expect(analytics.totalMinutesAllTime).toBe(120);
      expect(analytics.currentStreakDays).toBe(3);
      expect(analytics.weeklyGoalMinutes).toBe(180);
      expect(analytics.instrumentBreakdown.Piano).toBe(90);
      expect(analytics.instrumentBreakdown.Violin).toBe(30);
    });
  });
});
