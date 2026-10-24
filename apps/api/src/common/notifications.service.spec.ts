import { NotificationsService } from './notifications.service.js';

const TENANT_ID = 'tenant-1';

function createService() {
  const prisma = {
    membership: { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
  };
  const ctx = { tenantId: TENANT_ID, tenantIdOrNull: TENANT_ID };
  const outbox = { enqueue: vi.fn() };
  const service = new NotificationsService(prisma as any, ctx as any, outbox as any);
  return { service, prisma, outbox };
}

const announcement = (overrides: Record<string, unknown> = {}) => ({
  id: 'ann-1',
  title: 'Ωράριο',
  body: 'Αλλαγή στο ωράριο.',
  branchId: null,
  audienceRoles: [],
  ...overrides,
});

describe('NotificationsService.fanOutAnnouncement', () => {
  it('broadcasts to every active membership when the audience is empty', async () => {
    const { service, prisma, outbox } = createService();
    prisma.membership.findMany.mockResolvedValue([
      { userId: 'u-student', user: { email: 'student@example.gr' } },
      { userId: 'u-teacher', user: { email: 'teacher@example.gr' } },
      { userId: 'u-guardian', user: { email: 'guardian@example.gr' } },
      { userId: 'u-no-mail', user: { email: null } },
    ]);

    await service.fanOutAnnouncement(announcement());

    expect(prisma.membership.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      select: { userId: true, user: { select: { email: true } } },
    });
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: 'u-guardian',
          type: 'ANNOUNCEMENT',
          entityType: 'Announcement',
          entityId: 'ann-1',
          dedupeKey: 'announcement:ann-1',
        }),
      ]),
      skipDuplicates: true,
    });
    expect(prisma.notification.createMany.mock.calls[0][0].data).toHaveLength(4);
    expect(outbox.enqueue).toHaveBeenCalledTimes(3);
    expect(outbox.enqueue).toHaveBeenCalledWith({
      type: 'email',
      dedupeKey: 'announcement-email:ann-1:guardian@example.gr',
      payload: expect.objectContaining({
        to: 'guardian@example.gr',
        subject: expect.stringContaining('Ωράριο'),
      }),
    });
  });

  it('targets guardians when GUARDIAN is the selected audience', async () => {
    const { service, prisma } = createService();
    prisma.membership.findMany.mockResolvedValue([
      { userId: 'u-guardian', user: { email: 'guardian@example.gr' } },
    ]);

    await service.fanOutAnnouncement(announcement({ audienceRoles: ['GUARDIAN'] }));

    expect(prisma.membership.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        isActive: true,
        role: { in: ['GUARDIAN'] },
      },
      select: { userId: true, user: { select: { email: true } } },
    });
    expect(prisma.notification.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ userId: 'u-guardian' }),
    ]);
  });

  it('scopes branch announcements to that branch plus branchless members', async () => {
    const { service, prisma } = createService();
    prisma.membership.findMany.mockResolvedValue([]);

    await service.fanOutAnnouncement(announcement({ branchId: 'branch-1' }));

    expect(prisma.membership.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        isActive: true,
        OR: [{ branchId: 'branch-1' }, { branchId: null }],
      },
      select: { userId: true, user: { select: { email: true } } },
    });
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('is idempotent when fan-out runs again for the same announcement', async () => {
    const { service, prisma, outbox } = createService();
    prisma.membership.findMany.mockResolvedValue([
      { userId: 'u-student', user: { email: 'student@example.gr' } },
    ]);

    await service.fanOutAnnouncement(announcement());
    await service.fanOutAnnouncement(announcement());

    for (const call of prisma.notification.createMany.mock.calls) {
      expect(call[0].skipDuplicates).toBe(true);
      for (const row of call[0].data) {
        expect(row.dedupeKey).toBe('announcement:ann-1');
      }
    }
    expect(outbox.enqueue).toHaveBeenCalledWith({
      type: 'email',
      dedupeKey: 'announcement-email:ann-1:student@example.gr',
      payload: expect.anything(),
    });
  });
});
