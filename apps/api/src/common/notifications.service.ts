import { Injectable, NotFoundException } from '@nestjs/common';
import type { MembershipRole, NotificationType } from '../generated/prisma/enums.js';
import { PrismaService } from '../database/prisma.service.js';
import { OutboxService } from '../infrastructure/outbox/outbox.service.js';
import { TenantContextService } from './tenant-context.service.js';

interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  dedupeKey?: string;
}

export interface NotificationPageQuery {
  page: number;
  pageSize: number;
  skip: number;
  unreadOnly?: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly outbox: OutboxService,
  ) {}

  async createForUsers(userIds: string[], input: NotifyInput): Promise<void> {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (!unique.length) return;
    await this.prisma.notification.createMany({
      data: unique.map((userId) => ({
        tenantId: this.ctx.tenantIdOrNull,
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        dedupeKey: input.dedupeKey,
      })),
      skipDuplicates: true,
    });
  }

  async notifyLessonParticipants(
    lessonId: string,
    type: NotificationType,
    title: string,
    body: string,
  ): Promise<void> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, tenantId: this.ctx.tenantId },
      include: {
        teacher: { select: { userId: true } },
        students: { include: { student: { select: { userId: true } } } },
      },
    });
    if (!lesson) return;
    const userIds = [
      lesson.teacher.userId,
      ...lesson.students.map((row) => row.student.userId),
    ].filter((value): value is string => Boolean(value));
    await this.createForUsers(userIds, {
      type,
      title,
      body,
      entityType: 'Lesson',
      entityId: lessonId,
    });
  }

  async fanOutAnnouncement(announcement: {
    id: string;
    title: string;
    body: string;
    branchId: string | null;
    audienceRoles: MembershipRole[];
  }): Promise<void> {
    // An empty audience means broadcast: every active membership is in scope.
    // `role: { in: [] }` would match nobody, so the role filter only applies
    // when at least one audience role is selected.
    const memberships = await this.prisma.membership.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        isActive: true,
        ...(announcement.audienceRoles.length
          ? { role: { in: announcement.audienceRoles } }
          : {}),
        ...(announcement.branchId
          ? { OR: [{ branchId: announcement.branchId }, { branchId: null }] }
          : {}),
      },
      select: { userId: true, user: { select: { email: true } } },
    });
    const userIds = memberships.map((membership) => membership.userId);
    await this.createForUsers(userIds, {
      type: 'ANNOUNCEMENT',
      title: announcement.title,
      body: announcement.body.slice(0, 240),
      entityType: 'Announcement',
      entityId: announcement.id,
      dedupeKey: `announcement:${announcement.id}`,
    });
    const emails = [
      ...new Set(
        memberships
          .map((membership) => membership.user?.email)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    for (const email of emails) {
      await this.outbox.enqueue({
        type: 'email',
        dedupeKey: `announcement-email:${announcement.id}:${email}`,
        payload: {
          to: email,
          subject: `Νέα ανακοίνωση: ${announcement.title}`,
          text: `${announcement.title}\n\n${announcement.body}`,
        },
      });
    }
  }

  async listForCurrentUser(query: NotificationPageQuery) {
    const where = {
      userId: this.ctx.userId,
      tenantId: this.ctx.tenantId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };
    const [total, data, unread] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.notification.count({
        where: { userId: this.ctx.userId, tenantId: this.ctx.tenantId, readAt: null },
      }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        unread,
      },
    };
  }

  async markRead(id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId: this.ctx.userId, tenantId: this.ctx.tenantId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Η ειδοποίηση δεν βρέθηκε');
    return { success: true };
  }

  async markAllRead() {
    const result = await this.prisma.notification.updateMany({
      where: { userId: this.ctx.userId, tenantId: this.ctx.tenantId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, updated: result.count };
  }
}
