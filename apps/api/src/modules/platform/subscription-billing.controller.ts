import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  BillingWebhookDto,
  PaySubscriptionInvoiceDto,
  SimulatePaymentFailureDto,
  SubscriptionInvoiceQueryDto,
} from './dto/subscription-billing.dto.js';
import { SubscriptionBillingService } from './subscription-billing.service.js';

@ApiTags('platform-billing')
@ApiBearerAuth()
@Controller('platform/billing')
export class SubscriptionBillingController {
  constructor(private readonly billing: SubscriptionBillingService) {}

  @Get('invoices')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  listInvoices(@Query() query: SubscriptionInvoiceQueryDto) {
    return this.billing.listInvoices(query);
  }

  @Post('invoices/generate-cycle')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  generateBillingCycle() {
    return this.billing.generateBillingCycle();
  }

  @Post('invoices/:id/pay')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  payInvoice(
    @Param('id') id: string,
    @Body() dto?: PaySubscriptionInvoiceDto,
  ) {
    return this.billing.payInvoice(id, dto);
  }

  @Post('invoices/:id/simulate-failure')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  simulateFailure(
    @Param('id') id: string,
    @Body() dto: SimulatePaymentFailureDto,
  ) {
    return this.billing.recordPaymentFailure(id, dto);
  }

  @Get('metrics')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  getBillingMetrics() {
    return this.billing.getBillingMetrics();
  }

  @Post('webhook')
  processWebhook(@Body() dto: BillingWebhookDto) {
    return this.billing.processWebhook(dto);
  }
}
