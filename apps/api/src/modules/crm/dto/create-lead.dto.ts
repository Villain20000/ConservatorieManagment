import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { LeadSource, LeadStage } from '../../../generated/prisma/enums.js';

export class CreateLeadDto {
  @IsNotEmpty()
  @IsUUID()
  branchId!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  studentFirstName!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  studentLastName!: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  contactName!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  relationship?: string;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @IsOptional()
  @IsUUID()
  programId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  @IsOptional()
  @IsDateString()
  consentAt?: string;
}
