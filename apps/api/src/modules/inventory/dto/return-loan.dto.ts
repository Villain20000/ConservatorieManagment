import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { AssetCondition } from '../../../generated/prisma/enums.js';

export class ReturnLoanDto {
  @IsEnum(AssetCondition)
  @IsNotEmpty()
  returnCondition!: AssetCondition;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  returnAccessories?: string[];

  @IsString()
  @IsOptional()
  returnNotes?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  damageFeeCents?: number;

  @IsBoolean()
  @IsOptional()
  refundDeposit?: boolean;
}
