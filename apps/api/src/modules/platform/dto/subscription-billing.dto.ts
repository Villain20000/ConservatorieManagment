import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import {
  SubscriptionInvoiceStatus,
} from '../../../generated/prisma/enums.js';

export class PaySubscriptionInvoiceDto {
  @IsOptional()
  @IsString()
  paymentMethod?: string = 'CARD';

  @IsOptional()
  @IsString()
  externalTransactionId?: string;
}

export class SimulatePaymentFailureDto {
  @IsString()
  @IsNotEmpty()
  failureCode!: string;

  @IsOptional()
  @IsString()
  failureMessage?: string;
}

export class SubscriptionInvoiceQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsEnum(SubscriptionInvoiceStatus)
  status?: SubscriptionInvoiceStatus;
}

export class BillingWebhookDto {
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  eventType!: string; // 'invoice.payment_succeeded' | 'invoice.payment_failed'

  @IsString()
  @IsNotEmpty()
  invoiceExternalId!: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  amountCents!: number;

  @IsOptional()
  @IsString()
  failureCode?: string;
}
