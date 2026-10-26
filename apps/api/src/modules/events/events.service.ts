import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  EventStatus,
  EventType,
  PerformanceStatus,
  RegistrationStatus,
  RsvpStatus,
} from '../../generated/prisma/enums.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { CreatePerformanceDto } from './dto/create-performance.dto.js';
import { EventCheckinDto } from './dto/event-checkin.dto.js';
import { EventQueryDto } from './dto/event-query.dto.js';
import { RegisterAttendeeDto } from './dto/register-attendee.dto.js';
import { ReorderPerformancesDto } from './dto/reorder-performances.dto.js';
import { UpdateEventDto } from './dto/update-event.dto.js';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private slugify(text: string): string {
    return (
      text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') || `event-${Date.now()}`
    );
  }

  async listEvents(query: EventQueryDto) {
    const tenantId = this.ctx.tenantId;
    const where: Prisma.EventWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query.branchId) where.branchId = query.branchId;
    if (query.eventType) where.eventType = query.eventType;
    if (query.status) where.status = query.status;

    if (query.from || query.to) {
      where.startsAt = {};
      if (query.from) where.startsAt.gte = new Date(query.from);
      if (query.to) where.startsAt.lte = new Date(query.to);
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          room: { select: { id: true, name: true, capacity: true } },
          _count: {
            select: {
              performances: true,
              registrations: true,
            },
          },
        },
        orderBy: { startsAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);

    return {
      items,
      meta: pageMeta(total, query.page, query.pageSize),
    };
  }

  async getEvent(id: string) {
    const tenantId = this.ctx.tenantId;
    const event = await this.prisma.event.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        room: { select: { id: true, name: true, capacity: true } },
        academicYear: { select: { id: true, name: true } },
        performances: {
          orderBy: [{ part: 'asc' }, { orderIndex: 'asc' }],
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                registrationNumber: true,
              },
            },
            teacher: { select: { id: true, firstName: true, lastName: true } },
            accompanistTeacher: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        registrations: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        _count: {
          select: {
            performances: true,
            registrations: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async createEvent(dto: CreateEventDto) {
    const tenantId = this.ctx.tenantId;
    const baseSlug = dto.slug || this.slugify(dto.title);
    let finalSlug = baseSlug;
    let counter = 1;

    while (
      await this.prisma.event.findFirst({
        where: { tenantId, slug: finalSlug },
      })
    ) {
      finalSlug = `${baseSlug}-${counter++}`;
    }

    const event = await this.prisma.event.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        roomId: dto.roomId,
        academicYearId: dto.academicYearId,
        title: dto.title,
        slug: finalSlug,
        eventType: dto.eventType || EventType.CONCERT,
        status: EventStatus.SCHEDULED,
        description: dto.description,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        doorsOpenAt: dto.doorsOpenAt ? new Date(dto.doorsOpenAt) : null,
        maxCapacity: dto.maxCapacity || 100,
        isPublic: dto.isPublic ?? true,
        requiresRegistration: dto.requiresRegistration ?? true,
        ticketPriceCents: dto.ticketPriceCents || 0,
        programNotes: dto.programNotes,
        intermissionDurationMinutes: dto.intermissionDurationMinutes ?? 15,
        createdById: this.ctx.userId,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        room: { select: { id: true, name: true, capacity: true } },
      },
    });

    await this.audit.record('events.create', 'Event', event.id, {
      title: event.title,
      startsAt: event.startsAt,
    });

    return event;
  }

  async updateEvent(id: string, dto: UpdateEventDto) {
    const tenantId = this.ctx.tenantId;
    const existing = await this.prisma.event.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Event not found');
    }

    const data: Prisma.EventUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.branchId !== undefined) {
      data.branch = {
        connect: { tenantId_id: { tenantId, id: dto.branchId } },
      };
    }
    if (dto.roomId !== undefined) {
      data.room = dto.roomId
        ? { connect: { tenantId_id: { tenantId, id: dto.roomId } } }
        : { disconnect: true };
    }
    if (dto.academicYearId !== undefined) {
      data.academicYear = dto.academicYearId
        ? { connect: { tenantId_id: { tenantId, id: dto.academicYearId } } }
        : { disconnect: true };
    }
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.startsAt !== undefined) data.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) data.endsAt = new Date(dto.endsAt);
    if (dto.doorsOpenAt !== undefined)
      data.doorsOpenAt = dto.doorsOpenAt ? new Date(dto.doorsOpenAt) : null;
    if (dto.maxCapacity !== undefined) data.maxCapacity = dto.maxCapacity;
    if (dto.isPublic !== undefined) data.isPublic = dto.isPublic;
    if (dto.requiresRegistration !== undefined)
      data.requiresRegistration = dto.requiresRegistration;
    if (dto.ticketPriceCents !== undefined)
      data.ticketPriceCents = dto.ticketPriceCents;
    if (dto.programNotes !== undefined) data.programNotes = dto.programNotes;
    if (dto.intermissionDurationMinutes !== undefined)
      data.intermissionDurationMinutes = dto.intermissionDurationMinutes;

    const updated = await this.prisma.event.update({
      where: { id },
      data,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        room: { select: { id: true, name: true, capacity: true } },
      },
    });

    await this.audit.record('events.update', 'Event', id, {
      title: updated.title,
      status: updated.status,
    });

    return updated;
  }

  async deleteEvent(id: string) {
    const tenantId = this.ctx.tenantId;
    const existing = await this.prisma.event.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Event not found');
    }

    await this.prisma.event.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: this.ctx.userId,
      },
    });

    await this.audit.record('events.delete', 'Event', id);

    return { success: true };
  }

  async addPerformance(eventId: string, dto: CreatePerformanceDto) {
    const tenantId = this.ctx.tenantId;
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, deletedAt: null },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const part = dto.part || 1;
    let orderIndex = dto.orderIndex;

    if (!orderIndex) {
      const maxItem = await this.prisma.eventPerformance.findFirst({
        where: { eventId, part },
        orderBy: { orderIndex: 'desc' },
      });
      orderIndex = (maxItem?.orderIndex || 0) + 1;
    }

    const performance = await this.prisma.eventPerformance.create({
      data: {
        tenantId,
        eventId,
        part,
        orderIndex,
        studentId: dto.studentId,
        teacherId: dto.teacherId,
        accompanistTeacherId: dto.accompanistTeacherId,
        performerDisplayName: dto.performerDisplayName,
        pieceTitle: dto.pieceTitle,
        composer: dto.composer,
        movement: dto.movement,
        durationSeconds: dto.durationSeconds,
        stageNotes: dto.stageNotes,
        status: dto.status || PerformanceStatus.CONFIRMED,
        isEnsemble: dto.isEnsemble || false,
        ensembleName: dto.ensembleName,
        additionalPerformerIds: dto.additionalPerformerIds || [],
        stagePosition: dto.stagePosition,
        createdById: this.ctx.userId,
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
        teacher: { select: { id: true, firstName: true, lastName: true } },
        accompanistTeacher: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return performance;
  }

  async removePerformance(eventId: string, performanceId: string) {
    const tenantId = this.ctx.tenantId;
    const performance = await this.prisma.eventPerformance.findFirst({
      where: { id: performanceId, eventId, tenantId },
    });
    if (!performance) {
      throw new NotFoundException('Performance slot not found');
    }

    await this.prisma.eventPerformance.delete({
      where: { id: performanceId },
    });

    return { success: true };
  }

  async reorderPerformances(eventId: string, dto: ReorderPerformancesDto) {
    const tenantId = this.ctx.tenantId;
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, deletedAt: null },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Execute updates in a transaction
    await this.prisma.$transaction(async (tx) => {
      // Step 1: Set temporary negative order indices to avoid collision with @@unique([eventId, part, orderIndex])
      for (let i = 0; i < dto.reorderedItems.length; i++) {
        const item = dto.reorderedItems[i];
        await tx.eventPerformance.update({
          where: { id: item.performanceId },
          data: {
            part: item.part,
            orderIndex: -1 * (i + 1),
          },
        });
      }

      // Step 2: Set target order indices
      for (const item of dto.reorderedItems) {
        await tx.eventPerformance.update({
          where: { id: item.performanceId },
          data: {
            part: item.part,
            orderIndex: item.orderIndex,
          },
        });
      }
    });

    return { success: true, count: dto.reorderedItems.length };
  }

  async registerAttendee(eventId: string, dto: RegisterAttendeeDto) {
    const tenantId = this.ctx.tenantId;
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, deletedAt: null },
      include: {
        _count: { select: { registrations: true } },
      },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const currentTotal = event._count.registrations;
    const count = dto.ticketCount || 1;
    if (!dto.isVip && currentTotal + count > event.maxCapacity) {
      throw new ConflictException('Event is at maximum capacity');
    }

    const ticketCode = `TKT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const registration = await this.prisma.eventRegistration.create({
      data: {
        tenantId,
        eventId,
        studentId: dto.studentId,
        attendeeName: dto.attendeeName,
        attendeeEmail: dto.attendeeEmail,
        attendeePhone: dto.attendeePhone,
        ticketCode,
        seatNumber: dto.seatNumber,
        isVip: dto.isVip || false,
        ticketCount: count,
        rsvpStatus: dto.rsvpStatus || RsvpStatus.ATTENDING,
        status: RegistrationStatus.REGISTERED,
        createdById: this.ctx.userId,
      },
    });

    return registration;
  }

  async checkinTicket(eventId: string, dto: EventCheckinDto) {
    const tenantId = this.ctx.tenantId;
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, deletedAt: null },
      include: {
        registrations: { where: { status: RegistrationStatus.CHECKED_IN } },
      },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const registration = await this.prisma.eventRegistration.findFirst({
      where: {
        tenantId,
        eventId,
        ticketCode: dto.ticketCode,
      },
    });

    if (!registration) {
      throw new NotFoundException('Ticket code not found for this event');
    }

    if (registration.status === RegistrationStatus.CHECKED_IN) {
      throw new ConflictException({
        message: 'Ticket already scanned',
        alreadyCheckedIn: true,
        checkedInAt: registration.checkedInAt,
        attendeeName: registration.attendeeName,
      });
    }

    const currentCheckedIn = event.registrations.reduce(
      (sum, r) => sum + r.ticketCount,
      0,
    );
    if (
      !dto.overrideCapacity &&
      currentCheckedIn + registration.ticketCount > event.maxCapacity
    ) {
      throw new ConflictException('Event has reached venue safety capacity limit');
    }

    const updated = await this.prisma.eventRegistration.update({
      where: { id: registration.id },
      data: {
        status: RegistrationStatus.CHECKED_IN,
        checkedInAt: new Date(),
        checkedInById: this.ctx.userId,
      },
    });

    return {
      success: true,
      attendeeName: updated.attendeeName,
      ticketCode: updated.ticketCode,
      seatNumber: updated.seatNumber,
      isVip: updated.isVip,
      ticketCount: updated.ticketCount,
      checkedInAt: updated.checkedInAt,
      alreadyCheckedIn: false,
      currentEventStats: {
        maxCapacity: event.maxCapacity,
        checkedInTotal: currentCheckedIn + updated.ticketCount,
        remainingCapacity: Math.max(
          0,
          event.maxCapacity - (currentCheckedIn + updated.ticketCount),
        ),
      },
    };
  }

  async getProgram(eventId: string) {
    const event = await this.getEvent(eventId);

    const part1Performances = event.performances.filter((p) => p.part === 1);
    const part2Performances = event.performances.filter((p) => p.part === 2);

    const part1Seconds = part1Performances.reduce(
      (acc, p) => acc + p.durationSeconds,
      0,
    );
    const part2Seconds = part2Performances.reduce(
      (acc, p) => acc + p.durationSeconds,
      0,
    );
    const totalMinutes = Math.ceil(
      (part1Seconds + part2Seconds + event.intermissionDurationMinutes * 60) / 60,
    );

    return {
      title: event.title,
      eventType: event.eventType,
      startsAt: event.startsAt,
      branchName: event.branch?.name,
      roomName: event.room?.name,
      intermissionDurationMinutes: event.intermissionDurationMinutes,
      totalEstimatedMinutes: totalMinutes,
      part1: {
        durationSeconds: part1Seconds,
        performances: part1Performances,
      },
      part2: {
        durationSeconds: part2Seconds,
        performances: part2Performances,
      },
    };
  }
}
