import { describe, expect, it, vi } from 'vitest';
import { NumberingService } from './numbering.service.js';

const TENANT_ID = '01918a24-1111-7000-8000-000000000001';

describe('NumberingService', () => {
  it('generates sequential receipt numbers with atomic queryRaw', async () => {
    const prisma: any = {
      $queryRaw: vi.fn().mockResolvedValue([{ value: 42 }]),
    };
    const ctx: any = { tenantId: TENANT_ID };
    const service = new NumberingService(prisma, ctx);

    const year = new Date().getFullYear();
    const result = await service.nextReceipt();

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result).toBe(`REC-${year}-000042`);
  });

  it('generates sequential document protocol numbers', async () => {
    const prisma: any = {
      $queryRaw: vi.fn().mockResolvedValue([{ value: 7 }]),
    };
    const ctx: any = { tenantId: TENANT_ID };
    const service = new NumberingService(prisma, ctx);

    const year = new Date().getFullYear();
    const result = await service.nextDocument();

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result).toBe(`PRT-${year}-000007`);
  });

  it('supports transactional client if provided', async () => {
    const prisma: any = {
      $queryRaw: vi.fn(),
    };
    const tx: any = {
      $queryRaw: vi.fn().mockResolvedValue([{ value: 100 }]),
    };
    const ctx: any = { tenantId: TENANT_ID };
    const service = new NumberingService(prisma, ctx);

    const year = new Date().getFullYear();
    const result = await service.nextReceipt(tx);

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(result).toBe(`REC-${year}-000100`);
  });
});
