import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../common/audit.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  AssetCategory,
  AssetCondition,
  AssetStatus,
  LoanStatus,
  MaintenanceStatus,
  MaintenanceType,
} from '../../generated/prisma/enums.js';
import { InventoryService } from './inventory.service.js';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: any;
  let ctx: TenantContextService;
  let audit: any;

  beforeEach(() => {
    prisma = {
      asset: {
        count: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      assetLoan: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      assetMaintenance: {
        create: vi.fn(),
      },
      student: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(async (callback) => callback(prisma)),
    };

    ctx = { tenantId: 'tenant-1', userId: 'user-1' } as any;
    audit = { record: vi.fn().mockResolvedValue(undefined) };

    service = new InventoryService(
      prisma as unknown as PrismaService,
      ctx,
      audit as unknown as AuditService,
    );
  });

  describe('listAssets', () => {
    it('returns paginated assets scoped by tenantId', async () => {
      prisma.asset.count.mockResolvedValue(1);
      prisma.asset.findMany.mockResolvedValue([
        {
          id: 'asset-1',
          assetTag: 'ARM-PNO-001',
          category: AssetCategory.GRAND_PIANO,
          status: AssetStatus.AVAILABLE,
          pitchStandardHz: 442,
          branch: { id: 'b1', name: 'Main', code: 'MAIN' },
          loans: [],
        },
      ]);

      const result = await service.listAssets({
        page: 1,
        pageSize: 20,
        skip: 0,
      } as any);

      expect(prisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', deletedAt: null }),
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getAsset', () => {
    it('throws 404 if asset not found for tenant', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(service.getAsset('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createAsset', () => {
    it('rejects duplicate asset tag within the same tenant', async () => {
      prisma.asset.findFirst.mockResolvedValue({ id: 'existing-asset' });

      await expect(
        service.createAsset({
          branchId: 'b1',
          assetTag: 'ARM-PNO-001',
          category: AssetCategory.GRAND_PIANO,
          manufacturer: 'Steinway',
          model: 'D-274',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates asset with default 442 Hz pitch standard', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);
      prisma.asset.create.mockResolvedValue({
        id: 'asset-new',
        assetTag: 'ARM-PNO-002',
        pitchStandardHz: 442,
        category: AssetCategory.GRAND_PIANO,
      });

      const result = await service.createAsset({
        branchId: 'b1',
        assetTag: 'ARM-PNO-002',
        category: AssetCategory.GRAND_PIANO,
        manufacturer: 'Yamaha',
        model: 'CFX',
      });

      expect(result.pitchStandardHz).toBe(442);
      expect(audit.record).toHaveBeenCalledWith(
        'inventory.asset.create',
        'Asset',
        'asset-new',
        expect.anything(),
      );
    });
  });

  describe('checkoutLoan', () => {
    it('fails if asset is not marked as loanable', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-1',
        isLoanable: false,
        status: AssetStatus.AVAILABLE,
      });

      await expect(
        service.checkoutLoan({
          assetId: 'asset-1',
          studentId: 'student-1',
          loanDate: '2026-10-01',
          expectedReturnDate: '2026-12-01',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates active loan and shifts asset status to ON_LOAN', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-vln',
        assetTag: 'ARM-VLN-001',
        isLoanable: true,
        status: AssetStatus.AVAILABLE,
        condition: AssetCondition.EXCELLENT,
      });
      prisma.student.findFirst.mockResolvedValue({
        id: 'student-1',
        firstName: 'Nikos',
        lastName: 'Papadopoulos',
      });
      prisma.assetLoan.create.mockResolvedValue({
        id: 'loan-1',
        status: LoanStatus.ACTIVE,
      });

      const result = await service.checkoutLoan({
        assetId: 'asset-vln',
        studentId: 'student-1',
        loanDate: '2026-10-01',
        expectedReturnDate: '2026-12-01',
      });

      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'asset-vln' },
          data: { status: AssetStatus.ON_LOAN },
        }),
      );
      expect(result.id).toBe('loan-1');
    });
  });

  describe('returnLoan', () => {
    it('marks loan returned and returns asset to AVAILABLE with inspected condition', async () => {
      prisma.assetLoan.findFirst.mockResolvedValue({
        id: 'loan-1',
        assetId: 'asset-vln',
        status: LoanStatus.ACTIVE,
      });
      prisma.assetLoan.update.mockResolvedValue({
        id: 'loan-1',
        status: LoanStatus.RETURNED,
      });

      const result = await service.returnLoan('loan-1', {
        returnCondition: AssetCondition.GOOD,
        returnNotes: 'Returned in good order',
      });

      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'asset-vln' },
          data: {
            status: AssetStatus.AVAILABLE,
            condition: AssetCondition.GOOD,
          },
        }),
      );
      expect(result.status).toBe(LoanStatus.RETURNED);
    });
  });

  describe('logMaintenance', () => {
    it('updates asset tuning timestamps on piano service', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-piano',
        assetTag: 'ARM-PNO-001',
        pitchStandardHz: 442,
      });
      prisma.assetMaintenance.create.mockResolvedValue({
        id: 'maint-1',
        status: MaintenanceStatus.COMPLETED,
      });

      await service.logMaintenance({
        assetId: 'asset-piano',
        maintenanceType: MaintenanceType.PIANO_TUNING,
        technicianName: 'Master Tuner',
        costCents: 10000,
        serviceDate: '2026-10-25',
        nextServiceDue: '2027-01-25',
        pitchLeftHz: 442.0,
        workPerformed: 'Full concert tuning at 442 Hz',
      });

      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'asset-piano' },
          data: expect.objectContaining({
            lastTunedAt: new Date('2026-10-25'),
            nextTuningDueAt: new Date('2027-01-25'),
            pitchStandardHz: 442,
          }),
        }),
      );
    });
  });

  describe('getTuningAlerts', () => {
    it('accurately categorizes overdue and due soon pianos', async () => {
      const past = new Date(Date.now() - 5 * 24 * 3600 * 1000);
      const soon = new Date(Date.now() + 10 * 24 * 3600 * 1000);
      const future = new Date(Date.now() + 90 * 24 * 3600 * 1000);

      prisma.asset.findMany.mockResolvedValue([
        {
          id: 'p1',
          assetTag: 'P1',
          nextTuningDueAt: past,
          branch: { name: 'Main' },
        },
        {
          id: 'p2',
          assetTag: 'P2',
          nextTuningDueAt: soon,
          branch: { name: 'Main' },
        },
        {
          id: 'p3',
          assetTag: 'P3',
          nextTuningDueAt: future,
          branch: { name: 'Main' },
        },
      ]);

      const alerts = await service.getTuningAlerts();

      expect(alerts.overdueCount).toBe(1);
      expect(alerts.dueSoonCount).toBe(1);
      expect(alerts.totalNeedingAttention).toBe(2);
    });
  });
});
