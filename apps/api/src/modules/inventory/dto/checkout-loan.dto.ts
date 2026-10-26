import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { AssetCondition } from '../../../generated/prisma/enums.js';

export class CheckoutLoanDto {
  @IsUUID()
  @IsNotEmpty()
  assetId!: string;

  @IsUUID()
  @IsNotEmpty()
  studentId!: string;

  @IsUUID()
  @IsOptional()
  guardianId?: string;

  @IsISO8601()
  @IsNotEmpty()
  loanDate!: string;

  @IsISO8601()
  @IsNotEmpty()
  expectedReturnDate!: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  loanFeeCents?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  depositCents?: number;

  @IsEnum(AssetCondition)
  @IsOptional()
  checkoutCondition?: AssetCondition;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  checkoutAccessories?: string[];

  @IsString()
  @IsOptional()
  checkoutNotes?: string;
}
