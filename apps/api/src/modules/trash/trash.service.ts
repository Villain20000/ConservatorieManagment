import { Injectable, NotFoundException } from '@nestjs/common';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import type { PageMeta, PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

export const TRASH_ENTITIES = [
  'students',
  'teachers',
  'documents',
  'lessonSeries',
  'announcements',
] as const;

export type TrashEntity = (typeof TRASH_ENTITIES)[number];

export interface TrashRow {
  id: string;
  label: string;
  deletedAt: Date;
  deletedBy: string | null;
}

export interface TrashPage {
  data: TrashRow[];
  meta: PageMeta;
}

interface PendingRow {
  id: string;
  label: string;
  deletedAt: Date | null;
  deletedById: string | null;
}

export function isTrashEntity(value: string): value is TrashEntity {
  return (TRASH_ENTITIES as readonly string[]).includes(value);
}

/**
 * Read-only view over soft-deleted records.
 *
 * Every query passes `deletedAt: { not: null }` explicitly — that is the
 * extension's typed escape hatch; without it the extension would add
 * `deletedAt: null` and the trash would always be empty.
 *
 * Restore is intentionally not implemented here: undoing a delete belongs to the
 * module that owns the record (people, documents, scheduling, announcements).
 */
@Injectable()
export class TrashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
  ) {}

  async list(entity: string, query: PaginationQueryDto): Promise<TrashPage> {
    if (!isTrashEntity(entity)) {
      throw new NotFoundException({
        code: 'TRASH_ENTITY_NOT_FOUND',
        message: 'Άγνωστη οντότητα κάδου',
      });
    }

    switch (entity) {
      case 'students':
        return this.students(query);
      case 'teachers':
        return this.teachers(query);
      case 'documents':
        return this.documents(query);
      case 'lessonSeries':
        return this.lessonSeries(query);
      case 'announcements':
        return this.announcements(query);
    }
  }

  private async students(query: PaginationQueryDto): Promise<TrashPage> {
    const where: Prisma.StudentWhereInput = {
      tenantId: this.ctx.tenantId,
      deletedAt: { not: null },
    };
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { registrationNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { deletedAt: 'desc' },
        select: { id: true, firstName: true, lastName: true, deletedAt: true, deletedById: true },
      }),
      this.prisma.student.count({ where }),
    ]);

    return this.toPage(
      rows.map((row) => ({
        id: row.id,
        label: `${row.lastName} ${row.firstName}`.trim(),
        deletedAt: row.deletedAt,
        deletedById: row.deletedById,
      })),
      total,
      query,
    );
  }

  private async teachers(query: PaginationQueryDto): Promise<TrashPage> {
    const where: Prisma.TeacherWhereInput = {
      tenantId: this.ctx.tenantId,
      deletedAt: { not: null },
    };
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { employeeNo: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.teacher.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { deletedAt: 'desc' },
        select: { id: true, firstName: true, lastName: true, deletedAt: true, deletedById: true },
      }),
      this.prisma.teacher.count({ where }),
    ]);

    return this.toPage(
      rows.map((row) => ({
        id: row.id,
        label: `${row.lastName} ${row.firstName}`.trim(),
        deletedAt: row.deletedAt,
        deletedById: row.deletedById,
      })),
      total,
      query,
    );
  }

  private async documents(query: PaginationQueryDto): Promise<TrashPage> {
    const where: Prisma.DocumentRecordWhereInput = {
      tenantId: this.ctx.tenantId,
      deletedAt: { not: null },
    };
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { protocolNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.documentRecord.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { deletedAt: 'desc' },
        select: {
          id: true,
          title: true,
          protocolNumber: true,
          deletedAt: true,
          deletedById: true,
        },
      }),
      this.prisma.documentRecord.count({ where }),
    ]);

    return this.toPage(
      rows.map((row) => ({
        id: row.id,
        label: row.protocolNumber ? `${row.protocolNumber} · ${row.title}` : row.title,
        deletedAt: row.deletedAt,
        deletedById: row.deletedById,
      })),
      total,
      query,
    );
  }

  private async lessonSeries(query: PaginationQueryDto): Promise<TrashPage> {
    const where: Prisma.LessonSeriesWhereInput = {
      tenantId: this.ctx.tenantId,
      deletedAt: { not: null },
    };
    const search = query.search?.trim();
    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const [rows, total] = await Promise.all([
      this.prisma.lessonSeries.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { deletedAt: 'desc' },
        select: { id: true, title: true, deletedAt: true, deletedById: true },
      }),
      this.prisma.lessonSeries.count({ where }),
    ]);

    return this.toPage(
      rows.map((row) => ({
        id: row.id,
        label: row.title,
        deletedAt: row.deletedAt,
        deletedById: row.deletedById,
      })),
      total,
      query,
    );
  }

  private async announcements(query: PaginationQueryDto): Promise<TrashPage> {
    const where: Prisma.AnnouncementWhereInput = {
      tenantId: this.ctx.tenantId,
      deletedAt: { not: null },
    };
    const search = query.search?.trim();
    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const [rows, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { deletedAt: 'desc' },
        select: { id: true, title: true, deletedAt: true, deletedById: true },
      }),
      this.prisma.announcement.count({ where }),
    ]);

    return this.toPage(
      rows.map((row) => ({
        id: row.id,
        label: row.title,
        deletedAt: row.deletedAt,
        deletedById: row.deletedById,
      })),
      total,
      query,
    );
  }

  /**
   * `deletedById` is a bare UUID with no relation, so the display names need a
   * second query over the users referenced by this page.
   */
  private async resolveActors(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) {
      return new Map();
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, firstName: true, lastName: true },
    });

    return new Map(users.map((user) => [user.id, `${user.firstName} ${user.lastName}`.trim()]));
  }

  private async toPage(
    rows: PendingRow[],
    total: number,
    query: PaginationQueryDto,
  ): Promise<TrashPage> {
    const actors = await this.resolveActors(rows.map((row) => row.deletedById));

    return {
      data: rows.map((row) => ({
        id: row.id,
        label: row.label,
        // The query filters on `deletedAt: { not: null }`, so it is always set.
        deletedAt: row.deletedAt as Date,
        deletedBy: row.deletedById ? (actors.get(row.deletedById) ?? null) : null,
      })),
      meta: pageMeta(total, query.page, query.pageSize),
    };
  }
}
