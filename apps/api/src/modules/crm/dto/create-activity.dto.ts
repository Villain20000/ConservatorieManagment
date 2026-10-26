import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LeadActivityType, LeadStage } from '../../../generated/prisma/enums.js';

export class CreateActivityDto {
  @IsNotEmpty()
  @IsEnum(LeadActivityType)
  type!: LeadActivityType;

  @IsOptional()
  @IsEnum(LeadStage)
  fromStage?: LeadStage;

  @IsOptional()
  @IsEnum(LeadStage)
  toStage?: LeadStage;

  @IsOptional()
  @IsString()
  body?: string;
}
