import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service.js';

const TENANT_ID = 'tenant-1';
const AUTHOR_ID = 'author-1';

function createService(options: { isAdministrator?: boolean; userId?: string } = {}) {
  const prisma = {
    announcement: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    branch: { findFirst: vi.fn() },
    notification: { deleteMany: vi.fn() },
  };
  const ctx = {
    tenantId: TENANT_ID,
    userId: options.userId ?? AUTHOR_ID,
    user: { branchId: null },
    role: 'TEACHER',
  };
  const scope = { isAdministrator: options.isAdministrator ?? false };
  const notifications = { fanOutAnnouncement: vi.fn() };
  const audit = { record: vi.fn() };
  const service = new AnnouncementsService(
    prisma as any,
    ctx as any,
    scope as any,
    notifications as any,
    audit as any,
  );
  return { service, prisma, notifications, audit };
}

const stored = (overrides: Record<string, unknown> = {}) => ({
  id: 'ann-1',
  tenantId: TENANT_ID,
  authorId: AUTHOR_ID,
  branchId: null,
  audienceRoles: [],
  title: 'Ωράριο',
  body: 'Αλλαγή στο ωράριο.',
  ...overrides,
});

describe('AnnouncementsService update/remove policy', () => {
  it('lets the author update and re-fans out to the new audience', async () => {
    const { service, prisma, notifications, audit } = createService();
    prisma.announcement.findFirst.mockResolvedValue(stored());
    prisma.announcement.update.mockResolvedValue(
      stored({ audienceRoles: ['GUARDIAN'] }),
    );

    const updated = await service.update('ann-1', { audienceRoles: ['GUARDIAN'] as any });

    expect(updated.audienceRoles).toEqual(['GUARDIAN']);
    expect(notifications.fanOutAnnouncement).toHaveBeenCalledWith({
      id: 'ann-1',
      title: 'Ωράριο',
      body: 'Αλλαγή στο ωράριο.',
      branchId: null,
      audienceRoles: ['GUARDIAN'],
    });
    expect(audit.record).toHaveBeenCalledWith(
      'announcement.updated',
      'Announcement',
      'ann-1',
      { fields: ['audienceRoles'] },
    );
  });

  it('clears the branch when update sets branchId to null', async () => {
    const { service, prisma, notifications } = createService();
    prisma.announcement.findFirst.mockResolvedValue(stored({ branchId: 'branch-1' }));
    prisma.announcement.update.mockResolvedValue(stored({ branchId: null }));

    await service.update('ann-1', { branchId: null });

    expect(prisma.branch.findFirst).not.toHaveBeenCalled();
    expect(prisma.announcement.update).toHaveBeenCalledWith({
      where: { id: 'ann-1' },
      data: { branchId: null },
      include: expect.anything(),
    });
    expect(notifications.fanOutAnnouncement).toHaveBeenCalled();
  });

  it('rejects updates to an unknown branch', async () => {
    const { service, prisma, notifications } = createService();
    prisma.announcement.findFirst.mockResolvedValue(stored());
    prisma.branch.findFirst.mockResolvedValue(null);

    await expect(service.update('ann-1', { branchId: 'missing' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(notifications.fanOutAnnouncement).not.toHaveBeenCalled();
  });

  it('forbids edits by non-authors without an administrator role', async () => {
    const { service, prisma, notifications } = createService({ userId: 'other-1' });
    prisma.announcement.findFirst.mockResolvedValue(stored());

    await expect(service.update('ann-1', { title: 'x' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(notifications.fanOutAnnouncement).not.toHaveBeenCalled();
  });

  it('lets administrators remove announcements and clears their notifications', async () => {
    const { service, prisma, audit } = createService({
      isAdministrator: true,
      userId: 'admin-1',
    });
    prisma.announcement.findFirst.mockResolvedValue(stored());

    await service.remove('ann-1');

    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { entityType: 'Announcement', entityId: 'ann-1', tenantId: TENANT_ID },
    });
    expect(prisma.announcement.delete).toHaveBeenCalledWith({ where: { id: 'ann-1' } });
    expect(audit.record).toHaveBeenCalledWith('announcement.deleted', 'Announcement', 'ann-1');
  });

  it('forbids removal by non-authors without an administrator role', async () => {
    const { service, prisma } = createService({ userId: 'other-1' });
    prisma.announcement.findFirst.mockResolvedValue(stored());

    await expect(service.remove('ann-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.announcement.delete).not.toHaveBeenCalled();
  });
});
