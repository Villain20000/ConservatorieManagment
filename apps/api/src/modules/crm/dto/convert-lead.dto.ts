import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ConvertLeadDto {
  @IsOptional()
  @IsUUID()
  programId?: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  registrationNumber?: string;

  @IsOptional()
  @IsBoolean()
  isMinor?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  guardianRelationship?: string;

  @IsOptional()
  @IsBoolean()
  consentData?: boolean;

  @IsOptional()
  @IsBoolean()
  consentMedia?: boolean;

  @IsOptional()
  @IsDateString()
  enrolledAt?: string;
}
