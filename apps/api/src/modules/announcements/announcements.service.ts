import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { NotificationsService } from '../../common/notifications.service.js';
import { ScopeService } from '../../common/scope.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  AnnouncementQueryDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcements.dto.js';

const announcementInclude = {
  author: { select: { id: true, firstName: true, lastName: true } },
  branch: { select: { id: true, name: true } },
} as const;

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly scope: ScopeService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AnnouncementQueryDto) {
    const tenantId = this.ctx.tenantId;
    const where: Prisma.AnnouncementWhereInput = { tenantId };
    const and: Prisma.AnnouncementWhereInput[] = [];

    if (query.pinnedOnly) where.isPinned = true;
    if (query.audience) and.push({ audienceRoles: { has: query.audience } });

    if (!this.scope.isAdministrator) {
      const role = this.ctx.role;
      if (role) {
        and.push({
          OR: [
            { audienceRoles: { isEmpty: true } },
            { audienceRoles: { has: role } },
          ],
        });
      }
      const branchId = this.ctx.user.branchId;
      if (branchId) {
        and.push({ OR: [{ branchId: null }, { branchId }] });
      }
    }

    if (query.search) {
      and.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { body: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (and.length) where.AND = and;

    const [total, data] = await Promise.all([
      this.prisma.announcement.count({ where }),
      this.prisma.announcement.findMany({
        where,
        include: announcementInclude,
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);
    return { data, meta: pageMeta(total, query.page, query.pageSize) };
  }

  async create(dto: CreateAnnouncementDto) {
    const tenantId = this.ctx.tenantId;
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId },
      });
      if (!branch) throw new NotFoundException('Το παράρτημα δεν βρέθηκε');
    }
    const created = await this.prisma.announcement.create({
      data: {
        tenantId,
        authorId: this.ctx.userId,
        title: dto.title,
        body: dto.body,
        audienceRoles: dto.audienceRoles ?? [],
        branchId: dto.branchId ?? null,
        isPinned: dto.isPinned ?? false,
      },
      include: announcementInclude,
    });
    await this.notifications.fanOutAnnouncement({
      id: created.id,
      title: created.title,
      body: created.body,
      branchId: created.branchId,
      audienceRoles: created.audienceRoles,
    });
    await this.audit.record('announcement.created', 'Announcement', created.id);
    return created;
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.requireAnnouncement(id);
    this.assertCanModify(existing.authorId);
    if (dto.branchId !== undefined && dto.branchId !== null) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId: this.ctx.tenantId },
      });
      if (!branch) throw new NotFoundException('Το παράρτημα δεν βρέθηκε');
    }
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: dto,
      include: announcementInclude,
    });
    // Re-run fan-out so members added to the audience are notified.
    // Notifications and outbox e-mails are idempotent per announcement,
    // so existing recipients are not notified twice.
    await this.notifications.fanOutAnnouncement({
      id: updated.id,
      title: updated.title,
      body: updated.body,
      branchId: updated.branchId,
      audienceRoles: updated.audienceRoles,
    });
    await this.audit.record('announcement.updated', 'Announcement', id, {
      fields: Object.keys(dto),
    });
    return updated;
  }

  async remove(id: string) {
    const existing = await this.requireAnnouncement(id);
    this.assertCanModify(existing.authorId);
    await this.prisma.notification.deleteMany({
      where: {
        entityType: 'Announcement',
        entityId: id,
        tenantId: this.ctx.tenantId,
      },
    });
    await this.prisma.announcement.delete({ where: { id } });
    await this.audit.record('announcement.deleted', 'Announcement', id);
    return { success: true };
  }

  private async requireAnnouncement(id: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!announcement) throw new NotFoundException('Η ανακοίνωση δεν βρέθηκε');
    return announcement;
  }

  private assertCanModify(authorId: string) {
    if (this.scope.isAdministrator) return;
    if (authorId !== this.ctx.userId) {
      throw new ForbiddenException('Μπορείτε να επεξεργαστείτε μόνο δικές σας ανακοινώσεις');
    }
  }
}
