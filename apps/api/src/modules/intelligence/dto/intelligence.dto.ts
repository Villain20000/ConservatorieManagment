import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class GenerateDigestDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class ReviewDigestDto {
  @IsOptional()
  @IsString()
  contentMarkdown?: string;

  @IsString()
  @IsIn(['APPROVE', 'DISPATCH', 'ARCHIVE'])
  action!: 'APPROVE' | 'DISPATCH' | 'ARCHIVE';
}

export class DigestQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateRecommendationDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  teacherId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  category?: string = 'TECHNIQUE';

  @IsString()
  @MinLength(5)
  rationale!: string;

  @IsArray()
  prescribedExercises!: Array<{
    name: string;
    description: string;
    targetTempoBpm?: number;
    dailyMinutes?: number;
    measures?: string;
  }>;
}

export class ReviewRecommendationDto {
  @IsString()
  @IsIn(['APPROVED', 'MODIFIED', 'REJECTED'])
  status!: 'APPROVED' | 'MODIFIED' | 'REJECTED';

  @IsOptional()
  @IsString()
  teacherFeedback?: string;

  @IsOptional()
  @IsArray()
  modifiedExercises?: Array<Record<string, unknown>>;
}

export class RecommendationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ExplainConflictDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsString()
  @IsNotEmpty()
  teacherId!: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsString()
  @IsNotEmpty()
  branchId!: string;
}
