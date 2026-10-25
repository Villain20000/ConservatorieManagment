import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { RequiresFeature } from '../../common/decorators/require-feature.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import {
  BulkTuitionDto,
  CancelChargeDto,
  ChargeQueryDto,
  CreateChargeDto,
  CreateInstallmentPlanDto,
  CreatePaymentDto,
  CreateScholarshipDto,
  InstallmentPlanQueryDto,
  PaymentQueryDto,
  ScholarshipDecisionDto,
  ScholarshipQueryDto,
  UpdateChargeDto,
  VoidPaymentDto,
} from './dto/finance.dto.js';
import { FinanceService } from './finance.service.js';

@ApiTags('finance')
@ApiBearerAuth()
@RequiresFeature('finance')
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly ctx: TenantContextService,
  ) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  overview() {
    return this.finance.overview();
  }

  @Get('charges')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  charges(@Query() query: ChargeQueryDto) {
    return this.finance.listCharges(query);
  }

  @Post('charges')
  @RequirePermissions(PERMISSIONS.FINANCE_WRITE)
  createCharge(@Body() dto: CreateChargeDto) {
    return this.finance.createCharge(dto);
  }

  @Post('charges/bulk-tuition')
  @RequirePermissions(PERMISSIONS.FINANCE_WRITE)
  bulkTuition(@Body() dto: BulkTuitionDto) {
    return this.finance.bulkTuition(dto);
  }

  @Patch('charges/:id')
  @RequirePermissions(PERMISSIONS.FINANCE_WRITE)
  updateCharge(@Param('id') id: string, @Body() dto: UpdateChargeDto) {
    return this.finance.updateCharge(id, dto);
  }

  @Post('charges/:id/cancel')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FINANCE_WRITE)
  cancelCharge(@Param('id') id: string, @Body() dto: CancelChargeDto) {
    return this.finance.cancelCharge(id, dto.reason);
  }

  @Post('charges/:id/reopen')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FINANCE_APPROVE)
  reopenCharge(@Param('id') id: string) {
    return this.finance.reopenCharge(id);
  }

  @Get('installment-plans')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  installmentPlans(@Query() query: InstallmentPlanQueryDto) {
    return this.finance.listInstallmentPlans(query);
  }

  @Post('installment-plans')
  @RequirePermissions(PERMISSIONS.FINANCE_WRITE)
  createInstallmentPlan(@Body() dto: CreateInstallmentPlanDto) {
    return this.finance.createInstallmentPlan(dto);
  }

  @Post('installment-plans/:id/cancel')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FINANCE_WRITE)
  cancelInstallmentPlan(@Param('id') id: string, @Body() dto: CancelChargeDto) {
    return this.finance.cancelInstallmentPlan(id, dto.reason);
  }

  @Get('scholarships')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  scholarships(@Query() query: ScholarshipQueryDto) {
    return this.finance.listScholarships(query);
  }

  @Post('scholarships')
  @RequirePermissions(PERMISSIONS.FINANCE_WRITE)
  createScholarship(@Body() dto: CreateScholarshipDto) {
    return this.finance.createScholarship(dto);
  }

  @Patch('scholarships/:id')
  @RequirePermissions(PERMISSIONS.FINANCE_APPROVE)
  decideScholarship(@Param('id') id: string, @Body() dto: ScholarshipDecisionDto) {
    return this.finance.decideScholarship(id, dto.status);
  }

  @Get('payments')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  payments(@Query() query: PaymentQueryDto) {
    return this.finance.listPayments(query);
  }

  @Post('payments')
  @RequirePermissions(PERMISSIONS.FINANCE_WRITE)
  recordPayment(@Body() dto: CreatePaymentDto) {
    return this.finance.recordPayment(dto);
  }

  @Post('payments/:id/void')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FINANCE_APPROVE)
  voidPayment(@Param('id') id: string, @Body() dto: VoidPaymentDto) {
    return this.finance.voidPayment(id, dto.reason);
  }

  @Post('payments/:id/reopen')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FINANCE_APPROVE)
  reopenPayment(@Param('id') id: string) {
    return this.finance.reopenPayment(id);
  }

  @Get('payments/:id/receipt.pdf')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  async receipt(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.finance.paymentReceipt(id);
    const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    return new StreamableFile(buffer);
  }

  @Get('students/:id/ledger')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  ledger(@Param('id') id: string) {
    return this.finance.studentLedger(id);
  }

  @Post('reminders/run')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FINANCE_WRITE)
  runReminders() {
    return this.finance.sweepOverdue(this.ctx.tenantId);
  }
}
