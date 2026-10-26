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
  AssetCategory,
  AssetCondition,
  AssetStatus,
  LoanStatus,
  MaintenanceStatus,
  MaintenanceType,
} from '../../generated/prisma/enums.js';
import { AssetQueryDto } from './dto/asset-query.dto.js';
import { CheckoutLoanDto } from './dto/checkout-loan.dto.js';
import { CreateAssetDto } from './dto/create-asset.dto.js';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto.js';
import { ReturnLoanDto } from './dto/return-loan.dto.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  async listAssets(query: AssetQueryDto) {
    const tenantId = this.ctx.tenantId;
    const where: Prisma.AssetWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query.branchId) where.branchId = query.branchId;
    if (query.studioRoomId) where.studioRoomId = query.studioRoomId;
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.condition) where.condition = query.condition;

    if (query.needsTuning) {
      where.requiresTuning = true;
      where.OR = [
        { nextTuningDueAt: { lte: new Date() } },
        { lastTunedAt: null },
      ];
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { assetTag: { contains: term, mode: 'insensitive' } },
        { manufacturer: { contains: term, mode: 'insensitive' } },
        { model: { contains: term, mode: 'insensitive' } },
        { serialNumber: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          studioRoom: { select: { id: true, name: true } },
          loans: {
            where: { status: LoanStatus.ACTIVE },
            take: 1,
            include: {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  registrationNumber: true,
                },
              },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { assetTag: 'asc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);

    return {
      items,
      meta: pageMeta(total, query.page, query.pageSize),
    };
  }

  async getAsset(id: string) {
    const tenantId = this.ctx.tenantId;
    const asset = await this.prisma.asset.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        studioRoom: { select: { id: true, name: true } },
        loans: {
          orderBy: { loanDate: 'desc' },
          take: 10,
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                registrationNumber: true,
              },
            },
            guardian: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
        maintenance: {
          orderBy: { serviceDate: 'desc' },
          take: 10,
        },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return asset;
  }

  async createAsset(dto: CreateAssetDto) {
    const tenantId = this.ctx.tenantId;

    const existingTag = await this.prisma.asset.findFirst({
      where: { tenantId, assetTag: dto.assetTag },
    });
    if (existingTag) {
      throw new ConflictException(`Asset tag ${dto.assetTag} already exists`);
    }

    const asset = await this.prisma.asset.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        studioRoomId: dto.studioRoomId,
        assetTag: dto.assetTag,
        category: dto.category,
        manufacturer: dto.manufacturer,
        model: dto.model,
        serialNumber: dto.serialNumber,
        manufactureYear: dto.manufactureYear,
        condition: dto.condition || AssetCondition.GOOD,
        status: AssetStatus.AVAILABLE,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
        purchaseCostCents: dto.purchaseCostCents,
        replacementValueCents: dto.replacementValueCents,
        insurancePolicyNo: dto.insurancePolicyNo,
        isLoanable: dto.isLoanable ?? false,
        maxLoanDays: dto.maxLoanDays ?? 30,
        requiresTuning:
          dto.requiresTuning ??
          (dto.category === AssetCategory.GRAND_PIANO ||
            dto.category === AssetCategory.UPRIGHT_PIANO),
        pitchStandardHz: dto.pitchStandardHz ?? 442,
        notes: dto.notes,
        createdById: this.ctx.userId,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        studioRoom: { select: { id: true, name: true } },
      },
    });

    await this.audit.record('inventory.asset.create', 'Asset', asset.id, {
      assetTag: asset.assetTag,
      category: asset.category,
    });

    return asset;
  }

  async updateAsset(id: string, dto: UpdateAssetDto) {
    const tenantId = this.ctx.tenantId;
    const existing = await this.prisma.asset.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Asset not found');
    }

    const data: Prisma.AssetUpdateInput = {};
    if (dto.branchId !== undefined) {
      data.branch = {
        connect: { tenantId_id: { tenantId, id: dto.branchId } },
      };
    }
    if (dto.studioRoomId !== undefined) {
      data.studioRoom = dto.studioRoomId
        ? { connect: { tenantId_id: { tenantId, id: dto.studioRoomId } } }
        : { disconnect: true };
    }
    if (dto.assetTag !== undefined) data.assetTag = dto.assetTag;
    if (dto.manufacturer !== undefined) data.manufacturer = dto.manufacturer;
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.serialNumber !== undefined) data.serialNumber = dto.serialNumber;
    if (dto.condition !== undefined) data.condition = dto.condition;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.purchaseCostCents !== undefined)
      data.purchaseCostCents = dto.purchaseCostCents;
    if (dto.replacementValueCents !== undefined)
      data.replacementValueCents = dto.replacementValueCents;
    if (dto.insurancePolicyNo !== undefined)
      data.insurancePolicyNo = dto.insurancePolicyNo;
    if (dto.isLoanable !== undefined) data.isLoanable = dto.isLoanable;
    if (dto.maxLoanDays !== undefined) data.maxLoanDays = dto.maxLoanDays;
    if (dto.requiresTuning !== undefined)
      data.requiresTuning = dto.requiresTuning;
    if (dto.pitchStandardHz !== undefined)
      data.pitchStandardHz = dto.pitchStandardHz;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const updated = await this.prisma.asset.update({
      where: { id },
      data,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        studioRoom: { select: { id: true, name: true } },
      },
    });

    await this.audit.record('inventory.asset.update', 'Asset', id, {
      condition: updated.condition,
      status: updated.status,
    });

    return updated;
  }

  async deleteAsset(id: string) {
    const tenantId = this.ctx.tenantId;
    const existing = await this.prisma.asset.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Asset not found');
    }

    await this.prisma.asset.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: this.ctx.userId,
      },
    });

    await this.audit.record('inventory.asset.delete', 'Asset', id);

    return { success: true };
  }

  async checkoutLoan(dto: CheckoutLoanDto) {
    const tenantId = this.ctx.tenantId;

    const asset = await this.prisma.asset.findFirst({
      where: { id: dto.assetId, tenantId, deletedAt: null },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
    if (!asset.isLoanable) {
      throw new ConflictException('Asset is not marked as loanable');
    }
    if (asset.status !== AssetStatus.AVAILABLE) {
      throw new ConflictException(
        `Asset cannot be loaned. Current status: ${asset.status}`,
      );
    }

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId, deletedAt: null },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.assetLoan.create({
        data: {
          tenantId,
          assetId: dto.assetId,
          studentId: dto.studentId,
          guardianId: dto.guardianId,
          loanDate: new Date(dto.loanDate),
          expectedReturnDate: new Date(dto.expectedReturnDate),
          loanFeeCents: dto.loanFeeCents || 0,
          depositCents: dto.depositCents || 0,
          checkoutCondition: dto.checkoutCondition || asset.condition,
          checkoutAccessories: dto.checkoutAccessories || [],
          checkoutNotes: dto.checkoutNotes,
          status: LoanStatus.ACTIVE,
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
          asset: {
            select: {
              id: true,
              assetTag: true,
              manufacturer: true,
              model: true,
            },
          },
        },
      });

      await tx.asset.update({
        where: { id: dto.assetId },
        data: { status: AssetStatus.ON_LOAN },
      });

      await this.audit.record('inventory.loan.checkout', 'AssetLoan', loan.id, {
        assetTag: asset.assetTag,
        studentName: `${student.firstName} ${student.lastName}`,
        expectedReturnDate: dto.expectedReturnDate,
      });

      return loan;
    });
  }

  async returnLoan(loanId: string, dto: ReturnLoanDto) {
    const tenantId = this.ctx.tenantId;

    const loan = await this.prisma.assetLoan.findFirst({
      where: { id: loanId, tenantId },
      include: { asset: true },
    });
    if (!loan) {
      throw new NotFoundException('Loan record not found');
    }
    if (loan.status !== LoanStatus.ACTIVE) {
      throw new ConflictException(
        `Loan is already completed with status ${loan.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedLoan = await tx.assetLoan.update({
        where: { id: loanId },
        data: {
          returnedAt: new Date(),
          returnCondition: dto.returnCondition,
          returnAccessories: dto.returnAccessories || [],
          returnNotes: dto.returnNotes,
          damageFeeCents: dto.damageFeeCents || 0,
          depositReturned: dto.refundDeposit ?? true,
          status:
            dto.damageFeeCents && dto.damageFeeCents > 0
              ? LoanStatus.DAMAGED_RETURN
              : LoanStatus.RETURNED,
          inspectedById: this.ctx.userId,
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
          asset: {
            select: {
              id: true,
              assetTag: true,
              manufacturer: true,
              model: true,
            },
          },
        },
      });

      // Update asset condition and make available again
      await tx.asset.update({
        where: { id: loan.assetId },
        data: {
          status: AssetStatus.AVAILABLE,
          condition: dto.returnCondition,
        },
      });

      await this.audit.record('inventory.loan.return', 'AssetLoan', loanId, {
        returnedCondition: dto.returnCondition,
        damageFeeCents: dto.damageFeeCents || 0,
      });

      return updatedLoan;
    });
  }

  async logMaintenance(dto: CreateMaintenanceDto) {
    const tenantId = this.ctx.tenantId;

    const asset = await this.prisma.asset.findFirst({
      where: { id: dto.assetId, tenantId, deletedAt: null },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const maintenance = await tx.assetMaintenance.create({
        data: {
          tenantId,
          assetId: dto.assetId,
          maintenanceType: dto.maintenanceType,
          technicianName: dto.technicianName,
          technicianCompany: dto.technicianCompany,
          technicianPhone: dto.technicianPhone,
          costCents: dto.costCents || 0,
          serviceDate: new Date(dto.serviceDate),
          nextServiceDue: dto.nextServiceDue
            ? new Date(dto.nextServiceDue)
            : null,
          pitchMeasuredHz: dto.pitchMeasuredHz,
          pitchLeftHz: dto.pitchLeftHz,
          humidityPercentage: dto.humidityPercentage,
          temperatureCelsius: dto.temperatureCelsius,
          workPerformed: dto.workPerformed,
          partsReplaced: dto.partsReplaced,
          notes: dto.notes,
          invoiceNumber: dto.invoiceNumber,
          status: MaintenanceStatus.COMPLETED,
          createdById: this.ctx.userId,
        },
      });

      // If piano tuning, update the asset tuning schedule
      if (
        dto.maintenanceType === MaintenanceType.PIANO_TUNING ||
        dto.maintenanceType === MaintenanceType.VOICING_REGULATION
      ) {
        await tx.asset.update({
          where: { id: dto.assetId },
          data: {
            lastTunedAt: new Date(dto.serviceDate),
            nextTuningDueAt: dto.nextServiceDue
              ? new Date(dto.nextServiceDue)
              : null,
            pitchStandardHz: dto.pitchLeftHz
              ? Math.round(dto.pitchLeftHz)
              : asset.pitchStandardHz,
          },
        });
      }

      await this.audit.record('inventory.maintenance.log', 'AssetMaintenance', maintenance.id, {
        assetTag: asset.assetTag,
        technician: dto.technicianName,
        costCents: dto.costCents,
      });

      return maintenance;
    });
  }

  async getTuningAlerts() {
    const tenantId = this.ctx.tenantId;
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const candidates = await this.prisma.asset.findMany({
      where: {
        tenantId,
        deletedAt: null,
        requiresTuning: true,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        studioRoom: { select: { id: true, name: true } },
      },
      orderBy: { nextTuningDueAt: 'asc' },
    });

    const overdue = candidates.filter(
      (a) => a.nextTuningDueAt && a.nextTuningDueAt < now,
    );
    const dueSoon = candidates.filter(
      (a) =>
        a.nextTuningDueAt &&
        a.nextTuningDueAt >= now &&
        a.nextTuningDueAt <= thirtyDaysFromNow,
    );

    return {
      overdueCount: overdue.length,
      dueSoonCount: dueSoon.length,
      totalNeedingAttention: overdue.length + dueSoon.length,
      overdue: overdue.map((a) => ({
        assetId: a.id,
        assetTag: a.assetTag,
        manufacturer: a.manufacturer,
        model: a.model,
        roomName: a.studioRoom?.name || 'Main Hall',
        branchName: a.branch.name,
        lastTunedAt: a.lastTunedAt,
        nextTuningDueAt: a.nextTuningDueAt,
        pitchStandardHz: a.pitchStandardHz,
      })),
      dueSoon: dueSoon.map((a) => ({
        assetId: a.id,
        assetTag: a.assetTag,
        manufacturer: a.manufacturer,
        model: a.model,
        roomName: a.studioRoom?.name || 'Main Hall',
        branchName: a.branch.name,
        lastTunedAt: a.lastTunedAt,
        nextTuningDueAt: a.nextTuningDueAt,
        pitchStandardHz: a.pitchStandardHz,
      })),
    };
  }
}
