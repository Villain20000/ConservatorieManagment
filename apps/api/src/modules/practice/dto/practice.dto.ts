import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class LogPracticeSessionDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsDateString()
  startedAt!: string;

  @IsDateString()
  endedAt!: string;

  @IsInt()
  @Min(1)
  @Max(1440)
  @Type(() => Number)
  durationMinutes!: number;

  @IsString()
  @IsNotEmpty()
  instrument!: string;

  @IsOptional()
  @IsString()
  pieceTitle?: string;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(300)
  @Type(() => Number)
  tempoBpm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  metrics?: Record<string, unknown>;
}

export class PracticeQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  instrument?: string;
}
