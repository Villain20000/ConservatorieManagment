import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ChargeOrigin,
  ChargeStatus,
  PaymentMethod,
  PaymentStatus,
  ScholarshipType,
} from '../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class FinanceQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ChargeQueryDto extends FinanceQueryDto {
  @IsOptional()
  @IsEnum(ChargeStatus)
  status?: ChargeStatus;

  @IsOptional()
  @IsEnum(ChargeOrigin)
  origin?: ChargeOrigin;
}

export class PaymentQueryDto extends FinanceQueryDto {
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
}

export class CreateChargeDto {
  @IsString()
  studentId!: string;

  @IsString()
  @MaxLength(200)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  period?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsEnum(ChargeOrigin)
  origin?: ChargeOrigin;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountAmountCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  discountReason?: string;

  @IsOptional()
  @IsString()
  scholarshipId?: string;

  @IsOptional()
  @IsString()
  enrollmentId?: string;
}

export class UpdateChargeDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  period?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class CancelChargeDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class BulkTuitionDto {
  @IsString()
  @MaxLength(40)
  period!: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents?: number;
}

export class InstallmentPlanQueryDto extends FinanceQueryDto {}

export class CreateInstallmentPlanDto {
  @IsString()
  studentId!: string;

  @IsOptional()
  @IsString()
  enrollmentId?: string;

  @IsString()
  @MaxLength(200)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalAmountCents!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  count!: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  intervalDays?: number;
}

export class PaymentAllocationDto {
  @IsString()
  chargeId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number;
}

export class CreatePaymentDto {
  @IsString()
  studentId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[];
}

export class VoidPaymentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class ScholarshipQueryDto extends FinanceQueryDto {}

export class CreateScholarshipDto {
  @IsString()
  studentId!: string;

  @IsEnum(ScholarshipType)
  type!: ScholarshipType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsDateString()
  validFrom!: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;
}

export enum ScholarshipDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class ScholarshipDecisionDto {
  @IsEnum(ScholarshipDecision)
  status!: ScholarshipDecision;
}
