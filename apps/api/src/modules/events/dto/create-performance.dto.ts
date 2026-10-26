import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PerformanceStatus } from '../../../generated/prisma/enums.js';

export class CreatePerformanceDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  orderIndex?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  part?: number;

  @IsUUID()
  @IsOptional()
  studentId?: string;

  @IsUUID()
  @IsOptional()
  teacherId?: string;

  @IsUUID()
  @IsOptional()
  accompanistTeacherId?: string;

  @IsString()
  @IsNotEmpty()
  performerDisplayName!: string;

  @IsString()
  @IsNotEmpty()
  pieceTitle!: string;

  @IsString()
  @IsNotEmpty()
  composer!: string;

  @IsString()
  @IsOptional()
  movement?: string;

  @IsInt()
  @Min(1)
  durationSeconds!: number;

  @IsString()
  @IsOptional()
  stageNotes?: string;

  @IsEnum(PerformanceStatus)
  @IsOptional()
  status?: PerformanceStatus;

  @IsBoolean()
  @IsOptional()
  isEnsemble?: boolean;

  @IsString()
  @IsOptional()
  ensembleName?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  additionalPerformerIds?: string[];

  @IsString()
  @IsOptional()
  stagePosition?: string;
}
