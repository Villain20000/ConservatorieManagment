import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ExamApplicationStatus,
  ExamCommitteeRole,
  ExamOutcome,
  ExamPeriodStatus,
  ExamStatus,
  ExamType,
} from '../../../generated/prisma/enums.js';

export class ExamQueryDto {
  @IsOptional()
  @IsString()
  programId?: string;

  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsEnum(ExamStatus)
  status?: ExamStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CreateExamPeriodDto {
  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsDateString()
  startsOn!: string;

  @IsDateString()
  endsOn!: string;

  @IsOptional()
  @IsEnum(ExamPeriodStatus)
  status?: ExamPeriodStatus;
}

export class CreateExamDto {
  @IsUUID()
  programId!: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;

  @IsOptional()
  @IsUUID()
  periodId?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsEnum(ExamType)
  type?: ExamType;

  @IsDateString()
  examDate!: string;

  @IsOptional()
  @IsDateString()
  gradingDeadline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateExamDto {
  @IsOptional()
  @IsUUID()
  programId?: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;

  @IsOptional()
  @IsUUID()
  periodId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsEnum(ExamType)
  type?: ExamType;

  @IsOptional()
  @IsDateString()
  examDate?: string;

  @IsOptional()
  @IsDateString()
  gradingDeadline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CommitteeMemberDto {
  @IsUUID()
  teacherId!: string;

  @IsEnum(ExamCommitteeRole)
  role!: ExamCommitteeRole;
}

export class SetCommitteeDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CommitteeMemberDto)
  members!: CommitteeMemberDto[];
}

export class CreateExamApplicationDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class DecideExamApplicationDto {
  @IsEnum(ExamApplicationStatus)
  status!: ExamApplicationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNotes?: string;
}

export class ExamResultInputDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  grade?: number | null;

  @IsOptional()
  @IsEnum(ExamOutcome)
  outcome?: ExamOutcome;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class SaveExamResultsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ExamResultInputDto)
  results!: ExamResultInputDto[];
}

export class ResultQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
