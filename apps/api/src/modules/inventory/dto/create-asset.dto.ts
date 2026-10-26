import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { AssetCategory, AssetCondition } from '../../../generated/prisma/enums.js';

export class CreateAssetDto {
  @IsUUID()
  @IsNotEmpty()
  branchId!: string;

  @IsUUID()
  @IsOptional()
  studioRoomId?: string;

  @IsString()
  @IsNotEmpty()
  assetTag!: string;

  @IsEnum(AssetCategory)
  @IsNotEmpty()
  category!: AssetCategory;

  @IsString()
  @IsNotEmpty()
  manufacturer!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsInt()
  @IsOptional()
  manufactureYear?: number;

  @IsEnum(AssetCondition)
  @IsOptional()
  condition?: AssetCondition;

  @IsISO8601()
  @IsOptional()
  purchaseDate?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  purchaseCostCents?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  replacementValueCents?: number;

  @IsString()
  @IsOptional()
  insurancePolicyNo?: string;

  @IsBoolean()
  @IsOptional()
  isLoanable?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxLoanDays?: number;

  @IsBoolean()
  @IsOptional()
  requiresTuning?: boolean;

  @IsInt()
  @IsOptional()
  pitchStandardHz?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
