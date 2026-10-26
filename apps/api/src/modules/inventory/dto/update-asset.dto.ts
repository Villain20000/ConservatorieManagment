import { IsEnum, IsOptional } from 'class-validator';
import { AssetCondition, AssetStatus } from '../../../generated/prisma/enums.js';

export class UpdateAssetDto {
  @IsOptional()
  branchId?: string;

  @IsOptional()
  studioRoomId?: string;

  @IsOptional()
  assetTag?: string;

  @IsOptional()
  manufacturer?: string;

  @IsOptional()
  model?: string;

  @IsOptional()
  serialNumber?: string;

  @IsOptional()
  @IsEnum(AssetCondition)
  condition?: AssetCondition;

  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  purchaseCostCents?: number;

  @IsOptional()
  replacementValueCents?: number;

  @IsOptional()
  insurancePolicyNo?: string;

  @IsOptional()
  isLoanable?: boolean;

  @IsOptional()
  maxLoanDays?: number;

  @IsOptional()
  requiresTuning?: boolean;

  @IsOptional()
  pitchStandardHz?: number;

  @IsOptional()
  notes?: string;
}
