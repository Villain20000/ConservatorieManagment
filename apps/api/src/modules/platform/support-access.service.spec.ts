import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSupportGrantDto } from './dto/support-access.dto.js';
import { SupportAccessService } from './support-access.service.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const GRANT_ID = '33333333-3333-4333-8333-333333333333';

const TENANT = { id: TENANT_ID, name: 'Ωδείο Αρμονία', slug: 'armonia' };
const ACTOR = {
  id: '44444444-4444-4444-8444-444444444444',
  firstName: 'MusicOS',
  lastName: 'Admin',
  email: 'superadmin@musicos.test',
};

function grantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: GRANT_ID,
    tenantId: TENANT_ID,
    actorId: ACTOR.id,
    reason: 'E2E support access investigation',
    ticketRef: 'SUP-1',
    status: 'ACTIVE',
    expiresAt: new Date('2026-10-25T12:00:00Z'),
    usedAt: null,
    revokedAt: null,
    revokedById: null,
    createdAt: new Date('2026-10-25T11:00:00Z'),
    tenant: TENANT,
    actor: ACTOR,
    ...overrides,
  };
}

function createHarness() {
  const prisma = {
    tenant: { findUnique: vi.fn() },
    supportAccessGrant: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const cls = { get: vi.fn() };
  cls.get.mockImplementation((key: string) =>
    key === 'user' ? { userId: ACTOR.id } : undefined,
  );
  const audit = { recordForTenant: vi.fn() };
  audit.recordForTenant.mockResolvedValue(undefined);
  const service = new SupportAccessService(
    prisma as never,
    cls as never,
    audit as never,
  );
  return { prisma, cls, audit, service };
}

describe('CreateSupportGrantDto', () => {
  const base = {
    tenantId: TENANT_ID,
    reason: 'E2E support access investigation',
  };

  it.each([15, 240])('accepts an expiresInMinutes of %i', async (minutes) => {
    const errors = await validate(
      plainToInstance(CreateSupportGrantDto, {
        ...base,
        expiresInMinutes: minutes,
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it.each([14, 0, 241])(
    'rejects an expiresInMinutes of %i',
    async (minutes) => {
      const errors = await validate(
        plainToInstance(CreateSupportGrantDto, {
          ...base,
          expiresInMinutes: minutes,
        }),
      );
      expect(
        errors.some((error) => error.property === 'expiresInMinutes'),
      ).toBe(true);
    },
  );
});

describe('SupportAccessService', () => {
  it('rejects a grant for a tenant that does not exist', async () => {
    const harness = createHarness();
    harness.prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(
      harness.service.create({
        tenantId: TENANT_ID,
        reason: 'E2E support access investigation',
        expiresInMinutes: 60,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.prisma.supportAccessGrant.create).not.toHaveBeenCalled();
    expect(harness.audit.recordForTenant).not.toHaveBeenCalled();
  });

  it.each([15, 240])(
    'computes expiresAt %i minutes ahead and audits the target tenant',
    async (minutes) => {
      vi.useFakeTimers();
      const now = new Date('2026-10-25T10:00:00Z');
      vi.setSystemTime(now);

      try {
        const harness = createHarness();
        harness.prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID });
        const row = grantRow({
          expiresAt: new Date(now.getTime() + minutes * 60_000),
        });
        harness.prisma.supportAccessGrant.create.mockResolvedValue(row);

        const result = await harness.service.create({
          tenantId: TENANT_ID,
          reason: 'E2E support access investigation',
          ticketRef: 'SUP-1',
          expiresInMinutes: minutes,
        });

        expect(result).toBe(row);
        const createArgs = harness.prisma.supportAccessGrant.create.mock
          .calls[0]?.[0] as {
          data: {
            expiresAt: Date;
            actorId: string;
            status: string;
            tenantId: string;
          };
        };
        expect(createArgs.data.expiresAt.getTime()).toBe(
          now.getTime() + minutes * 60_000,
        );
        expect(createArgs.data.actorId).toBe(ACTOR.id);
        expect(createArgs.data.status).toBe('ACTIVE');
        expect(createArgs.data.tenantId).toBe(TENANT_ID);
        expect(harness.audit.recordForTenant).toHaveBeenCalledWith(
          TENANT_ID,
          'support_access.granted',
          'SupportAccessGrant',
          GRANT_ID,
          expect.objectContaining({
            ticketRef: 'SUP-1',
            expiresAt: row.expiresAt,
          }),
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('paginates grants and includes the tenant and actor', async () => {
    const harness = createHarness();
    const rows = [grantRow()];
    harness.prisma.supportAccessGrant.findMany.mockResolvedValue(rows);
    harness.prisma.supportAccessGrant.count.mockResolvedValue(31);

    const result = await harness.service.list({
      tenantId: TENANT_ID,
      status: 'ACTIVE',
    });

    expect(result.data).toBe(rows);
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 25,
      total: 31,
      totalPages: 2,
    });
    expect(harness.prisma.supportAccessGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID, status: 'ACTIVE' },
        skip: 0,
        take: 25,
        orderBy: { createdAt: 'desc' },
      }),
    );
    const findArgs = harness.prisma.supportAccessGrant.findMany.mock
      .calls[0]?.[0] as {
      include: { tenant: unknown; actor: unknown };
    };
    expect(findArgs.include.tenant).toBeDefined();
    expect(findArgs.include.actor).toBeDefined();
  });

  it('returns 404 for a grant that does not exist', async () => {
    const harness = createHarness();
    harness.prisma.supportAccessGrant.findUnique.mockResolvedValue(null);

    await expect(harness.service.get(GRANT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('revokes an active grant once and audits the target tenant', async () => {
    const harness = createHarness();
    const active = grantRow();
    const revoked = grantRow({
      status: 'REVOKED',
      revokedAt: new Date('2026-10-25T11:30:00Z'),
      revokedById: ACTOR.id,
    });
    harness.prisma.supportAccessGrant.findUnique
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(revoked);
    harness.prisma.supportAccessGrant.updateMany.mockResolvedValue({ count: 1 });
    harness.prisma.supportAccessGrant.findUniqueOrThrow.mockResolvedValue(
      revoked,
    );

    const result = await harness.service.revoke(GRANT_ID);

    expect(result).toBe(revoked);
    expect(harness.prisma.supportAccessGrant.updateMany).toHaveBeenCalledWith({
      where: { id: GRANT_ID, status: 'ACTIVE' },
      data: {
        status: 'REVOKED',
        revokedAt: expect.any(Date),
        revokedById: ACTOR.id,
      },
    });
    expect(
      harness.prisma.supportAccessGrant.findUniqueOrThrow,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GRANT_ID },
        include: expect.objectContaining({
          tenant: expect.any(Object),
          actor: expect.any(Object),
        }),
      }),
    );
    expect(harness.audit.recordForTenant).toHaveBeenCalledTimes(1);
    expect(harness.audit.recordForTenant).toHaveBeenCalledWith(
      TENANT_ID,
      'support_access.revoked',
      'SupportAccessGrant',
      GRANT_ID,
      expect.objectContaining({ ticketRef: 'SUP-1' }),
    );

    // Repeating the revoke is idempotent: no second update and no second audit.
    const repeated = await harness.service.revoke(GRANT_ID);

    expect(repeated.status).toBe('REVOKED');
    expect(harness.prisma.supportAccessGrant.updateMany).toHaveBeenCalledTimes(
      1,
    );
    expect(
      harness.prisma.supportAccessGrant.findUniqueOrThrow,
    ).toHaveBeenCalledTimes(1);
    expect(harness.audit.recordForTenant).toHaveBeenCalledTimes(1);
  });

  it('does not audit when a concurrent revoke wins the transition', async () => {
    const harness = createHarness();
    // The in-memory read still sees ACTIVE, but by update time the row was
    // revoked (or expired) elsewhere, so updateMany matches nothing.
    harness.prisma.supportAccessGrant.findUnique.mockResolvedValue(grantRow());
    const current = grantRow({ status: 'REVOKED' });
    harness.prisma.supportAccessGrant.updateMany.mockResolvedValue({ count: 0 });
    harness.prisma.supportAccessGrant.findUniqueOrThrow.mockResolvedValue(
      current,
    );

    const result = await harness.service.revoke(GRANT_ID);

    expect(result).toBe(current);
    expect(harness.prisma.supportAccessGrant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: GRANT_ID, status: 'ACTIVE' } }),
    );
    expect(
      harness.prisma.supportAccessGrant.findUniqueOrThrow,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GRANT_ID },
        include: expect.objectContaining({
          tenant: expect.any(Object),
          actor: expect.any(Object),
        }),
      }),
    );
    expect(harness.audit.recordForTenant).not.toHaveBeenCalled();
  });

  it('does not revoke or audit a grant that already expired', async () => {
    const harness = createHarness();
    const expired = grantRow({ status: 'EXPIRED' });
    harness.prisma.supportAccessGrant.findUnique.mockResolvedValue(expired);

    const result = await harness.service.revoke(GRANT_ID);

    expect(result.status).toBe('EXPIRED');
    expect(
      harness.prisma.supportAccessGrant.updateMany,
    ).not.toHaveBeenCalled();
    expect(
      harness.prisma.supportAccessGrant.findUniqueOrThrow,
    ).not.toHaveBeenCalled();
    expect(harness.audit.recordForTenant).not.toHaveBeenCalled();
  });

  it('lists at most the 50 most recent grants for one tenant only', async () => {
    const harness = createHarness();
    const rows = [grantRow()];
    harness.prisma.supportAccessGrant.findMany.mockResolvedValue(rows);

    const result = await harness.service.listForTenant(TENANT_ID);

    expect(result).toEqual({ data: rows });
    expect(harness.prisma.supportAccessGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
  });

  it('scopes tenant revokes to the calling tenant and 404s otherwise', async () => {
    const harness = createHarness();
    harness.prisma.supportAccessGrant.findFirst.mockResolvedValue(null);

    await expect(
      harness.service.revokeForTenant(OTHER_TENANT_ID, GRANT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.prisma.supportAccessGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GRANT_ID, tenantId: OTHER_TENANT_ID },
      }),
    );
    expect(
      harness.prisma.supportAccessGrant.updateMany,
    ).not.toHaveBeenCalled();
    expect(harness.audit.recordForTenant).not.toHaveBeenCalled();
  });

  it('audits a tenant revoke for the grant tenant, not the session tenant', async () => {
    const harness = createHarness();
    harness.prisma.supportAccessGrant.findFirst.mockResolvedValue(grantRow());
    harness.prisma.supportAccessGrant.updateMany.mockResolvedValue({ count: 1 });
    harness.prisma.supportAccessGrant.findUniqueOrThrow.mockResolvedValue(
      grantRow({ status: 'REVOKED' }),
    );

    const result = await harness.service.revokeForTenant(
      OTHER_TENANT_ID,
      GRANT_ID,
    );

    expect(result.status).toBe('REVOKED');
    // The grant row still carries TENANT_ID; the caller-supplied tenant is only
    // the lookup scope, so the audit must follow the grant itself.
    expect(harness.audit.recordForTenant).toHaveBeenCalledWith(
      TENANT_ID,
      'support_access.revoked',
      'SupportAccessGrant',
      GRANT_ID,
      expect.objectContaining({ ticketRef: 'SUP-1' }),
    );
  });
});
