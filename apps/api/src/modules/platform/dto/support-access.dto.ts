import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SupportAccessStatus } from '../../../generated/prisma/enums.js';

export class CreateSupportGrantDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @Length(10, 500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ticketRef?: string;

  @IsInt()
  @Min(15)
  @Max(240)
  expiresInMinutes!: number;
}

export class SupportGrantQueryDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsEnum(SupportAccessStatus)
  status?: SupportAccessStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
