import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  LogPracticeSessionDto,
  PracticeQueryDto,
} from './dto/practice.dto.js';

@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private async resolveStudentId(providedId?: string): Promise<string> {
    const tenantId = this.ctx.tenantId;

    if (providedId) {
      const student = await this.prisma.student.findFirst({
        where: { id: providedId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!student) {
        throw new NotFoundException('Student not found');
      }
      return student.id;
    }

    if (this.ctx.userId) {
      const student = await this.prisma.student.findFirst({
        where: { userId: this.ctx.userId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (student) {
        return student.id;
      }
    }

    throw new NotFoundException('No active student found for practice session');
  }

  async logSession(dto: LogPracticeSessionDto) {
    const tenantId = this.ctx.tenantId;
    const studentId = await this.resolveStudentId(dto.studentId);

    const session = await this.prisma.practiceSession.create({
      data: {
        tenantId,
        studentId,
        startedAt: new Date(dto.startedAt),
        endedAt: new Date(dto.endedAt),
        durationMinutes: dto.durationMinutes,
        instrument: dto.instrument,
        pieceTitle: dto.pieceTitle ?? null,
        tempoBpm: dto.tempoBpm ?? null,
        rating: dto.rating ?? null,
        notes: dto.notes ?? null,
        metrics: dto.metrics as Prisma.InputJsonValue ?? Prisma.JsonNull,
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            registrationNumber: true,
          },
        },
      },
    });

    await this.audit.record(
      'practice.session_logged',
      'PracticeSession',
      session.id,
      {
        studentId,
        durationMinutes: session.durationMinutes,
        instrument: session.instrument,
      },
    );

    return session;
  }

  async listSessions(query: PracticeQueryDto) {
    const tenantId = this.ctx.tenantId;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.PracticeSessionWhereInput = {
      tenantId,
    };

    if (query.studentId) {
      where.studentId = query.studentId;
    }

    if (query.instrument) {
      where.instrument = { equals: query.instrument, mode: 'insensitive' };
    }

    if (query.from || query.to) {
      where.startedAt = {};
      if (query.from) {
        where.startedAt.gte = new Date(query.from);
      }
      if (query.to) {
        where.startedAt.lte = new Date(query.to);
      }
    }

    const [total, sessions] = await Promise.all([
      this.prisma.practiceSession.count({ where }),
      this.prisma.practiceSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              registrationNumber: true,
            },
          },
        },
      }),
    ]);

    return {
      data: sessions,
      meta: pageMeta(total, page, pageSize),
    };
  }

  async getAnalytics(studentIdFilter?: string) {
    const tenantId = this.ctx.tenantId;
    let targetStudentId = studentIdFilter;

    if (!targetStudentId && this.ctx.userId) {
      const student = await this.prisma.student.findFirst({
        where: { userId: this.ctx.userId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (student) {
        targetStudentId = student.id;
      }
    }

    const where: Prisma.PracticeSessionWhereInput = {
      tenantId,
      ...(targetStudentId ? { studentId: targetStudentId } : {}),
    };

    const allSessions = await this.prisma.practiceSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: 200,
    });

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    const day = startOfWeek.getDay() || 7;
    startOfWeek.setDate(startOfWeek.getDate() - day + 1); // Monday

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalMinutesAllTime = 0;
    let totalMinutesThisWeek = 0;
    let totalMinutesThisMonth = 0;
    const instrumentBreakdown: Record<string, number> = {};
    const dayOfWeekDistribution = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun

    for (const session of allSessions) {
      const d = session.startedAt;
      totalMinutesAllTime += session.durationMinutes;

      if (d >= startOfWeek) {
        totalMinutesThisWeek += session.durationMinutes;
      }
      if (d >= startOfMonth) {
        totalMinutesThisMonth += session.durationMinutes;
      }

      const inst = session.instrument || 'General';
      instrumentBreakdown[inst] = (instrumentBreakdown[inst] || 0) + session.durationMinutes;

      const jsDay = d.getDay(); // 0 is Sun, 1 is Mon...
      const mappedIdx = jsDay === 0 ? 6 : jsDay - 1;
      dayOfWeekDistribution[mappedIdx] += session.durationMinutes;
    }

    // Calculate daily consistency streak
    const uniqueDates = Array.from(
      new Set(allSessions.map((s) => s.startedAt.toISOString().slice(0, 10))),
    ).sort().reverse();

    let streak = 0;
    if (uniqueDates.length > 0) {
      const todayStr = now.toISOString().slice(0, 10);
      const yesterday = new Date(now.getTime() - 86400000);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      let checkDate = new Date(uniqueDates[0]);
      if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
        streak = 1;
        for (let i = 1; i < uniqueDates.length; i++) {
          const prevExpected = new Date(checkDate.getTime() - 86400000).toISOString().slice(0, 10);
          if (uniqueDates[i] === prevExpected) {
            streak++;
            checkDate = new Date(uniqueDates[i]);
          } else {
            break;
          }
        }
      }
    }

    const weeklyGoalMinutes = 180;
    const weeklyGoalCompletionRate = Math.min(
      100,
      Math.round((totalMinutesThisWeek / weeklyGoalMinutes) * 100),
    );

    return {
      totalMinutesAllTime,
      totalMinutesThisWeek,
      totalMinutesThisMonth,
      currentStreakDays: streak,
      weeklyGoalMinutes,
      weeklyGoalCompletionRate,
      dayOfWeekDistribution,
      instrumentBreakdown,
      recentSessions: allSessions.slice(0, 5),
    };
  }
}
