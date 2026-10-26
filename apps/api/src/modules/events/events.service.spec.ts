import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../common/audit.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  EventType,
  RegistrationStatus,
} from '../../generated/prisma/enums.js';
import { EventsService } from './events.service.js';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: any;
  let ctx: TenantContextService;
  let audit: any;

  beforeEach(() => {
    prisma = {
      event: {
        count: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      eventPerformance: {
        findFirst: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      },
      eventRegistration: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (callback) => callback(prisma)),
    };

    ctx = { tenantId: 'tenant-1', userId: 'user-1' } as any;
    audit = { record: vi.fn().mockResolvedValue(undefined) };

    service = new EventsService(prisma as unknown as PrismaService, ctx, audit as unknown as AuditService);
  });

  describe('listEvents', () => {
    it('returns paginated events scoped by tenantId', async () => {
      prisma.event.count.mockResolvedValue(1);
      prisma.event.findMany.mockResolvedValue([
        {
          id: 'event-1',
          title: 'Christmas Concert',
          startsAt: new Date('2026-12-20T18:00:00Z'),
          branch: { id: 'b1', name: 'Main', code: 'MAIN' },
          room: { id: 'r1', name: 'Hall', capacity: 100 },
          _count: { performances: 5, registrations: 40 },
        },
      ]);

      const result = await service.listEvents({
        page: 1,
        pageSize: 20,
        skip: 0,
      } as any);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', deletedAt: null }),
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getEvent', () => {
    it('throws 404 if event does not exist for tenant', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(service.getEvent('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns event details when found', async () => {
      const mockEvent = {
        id: 'event-1',
        title: 'Spring Recital',
        performances: [],
        registrations: [],
      };
      prisma.event.findFirst.mockResolvedValue(mockEvent);

      const result = await service.getEvent('event-1');
      expect(result.id).toBe('event-1');
      expect(prisma.event.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'event-1', tenantId: 'tenant-1', deletedAt: null },
        }),
      );
    });
  });

  describe('createEvent', () => {
    it('generates a unique slug and audits event creation', async () => {
      prisma.event.findFirst.mockResolvedValue(null); // No slug collision
      prisma.event.create.mockResolvedValue({
        id: 'event-new',
        title: 'Piano Showcase',
        slug: 'piano-showcase',
        startsAt: new Date('2026-11-15T18:00:00Z'),
      });

      const result = await service.createEvent({
        branchId: 'b-1',
        title: 'Piano Showcase',
        startsAt: '2026-11-15T18:00:00Z',
        endsAt: '2026-11-15T20:00:00Z',
      });

      expect(result.slug).toBe('piano-showcase');
      expect(audit.record).toHaveBeenCalledWith(
        'events.create',
        'Event',
        'event-new',
        expect.anything(),
      );
    });
  });

  describe('addPerformance', () => {
    it('appends performance with auto orderIndex if omitted', async () => {
      prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
      prisma.eventPerformance.findFirst.mockResolvedValue({ orderIndex: 3 });
      prisma.eventPerformance.create.mockResolvedValue({
        id: 'perf-1',
        part: 1,
        orderIndex: 4,
        pieceTitle: 'Chopin Nocturne',
      });

      const result = await service.addPerformance('event-1', {
        performerDisplayName: 'Maria',
        pieceTitle: 'Chopin Nocturne',
        composer: 'Chopin',
        durationSeconds: 240,
      });

      expect(prisma.eventPerformance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            part: 1,
            orderIndex: 4,
          }),
        }),
      );
      expect(result.id).toBe('perf-1');
    });
  });

  describe('checkinTicket', () => {
    it('admits attendee on valid ticket', async () => {
      prisma.event.findFirst.mockResolvedValue({
        id: 'event-1',
        maxCapacity: 100,
        registrations: [],
      });
      prisma.eventRegistration.findFirst.mockResolvedValue({
        id: 'reg-1',
        ticketCode: 'TKT-123',
        attendeeName: 'Alexandros',
        ticketCount: 1,
        status: RegistrationStatus.REGISTERED,
        checkedInAt: null,
      });
      prisma.eventRegistration.update.mockResolvedValue({
        id: 'reg-1',
        ticketCode: 'TKT-123',
        attendeeName: 'Alexandros',
        ticketCount: 1,
        status: RegistrationStatus.CHECKED_IN,
        checkedInAt: new Date('2026-12-20T17:30:00Z'),
      });

      const result = await service.checkinTicket('event-1', {
        ticketCode: 'TKT-123',
      });

      expect(result.success).toBe(true);
      expect(result.attendeeName).toBe('Alexandros');
      expect(result.currentEventStats.checkedInTotal).toBe(1);
    });

    it('rejects duplicate ticket check-in with 409 Conflict', async () => {
      prisma.event.findFirst.mockResolvedValue({
        id: 'event-1',
        maxCapacity: 100,
        registrations: [],
      });
      prisma.eventRegistration.findFirst.mockResolvedValue({
        id: 'reg-1',
        ticketCode: 'TKT-123',
        status: RegistrationStatus.CHECKED_IN,
        checkedInAt: new Date('2026-12-20T17:15:00Z'),
      });

      await expect(
        service.checkinTicket('event-1', { ticketCode: 'TKT-123' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getProgram', () => {
    it('structures performances into parts and calculates timings', async () => {
      prisma.event.findFirst.mockResolvedValue({
        id: 'event-1',
        title: 'Gala Concert',
        eventType: EventType.CONCERT,
        startsAt: new Date('2026-12-20T18:00:00Z'),
        intermissionDurationMinutes: 15,
        performances: [
          { part: 1, orderIndex: 1, durationSeconds: 300, pieceTitle: 'Sonata 1' },
          { part: 1, orderIndex: 2, durationSeconds: 300, pieceTitle: 'Sonata 2' },
          { part: 2, orderIndex: 1, durationSeconds: 600, pieceTitle: 'Concerto' },
        ],
        registrations: [],
      });

      const program = await service.getProgram('event-1');

      expect(program.part1.durationSeconds).toBe(600);
      expect(program.part2.durationSeconds).toBe(600);
      // Total = 600s + 600s + 15m (900s) = 2100s = 35 minutes
      expect(program.totalEstimatedMinutes).toBe(35);
    });
  });
});
