import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AssignmentStatus, SubmissionStatus } from '../../../generated/prisma/enums.js';

export class CreateAssignmentDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** Students the assignment targets. Per-student targets keep teacher
   * scoping simple and make submissions 1:1 with targets. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('7', { each: true })
  studentIds!: string[];

  @IsOptional()
  @IsUUID('7')
  programId?: string;

  @IsOptional()
  @IsUUID('7')
  lessonSeriesId?: string;

  @IsDateString()
  assignedOn!: string;

  /** Optional due date-time (UTC ISO). Only enforced for display and
   * "late" labelling β€” submissions are never hard-rejected by due date. */
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** Replace the target set. Targets already submitted keep their submission;
   * removed targets lose theirs (the assignment row keeps its history). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('7', { each: true })
  studentIds?: string[];

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;
}

export class SubmitAssignmentDto {
  @IsString()
  @MaxLength(8000)
  content!: string;
}

export class GradeSubmissionDto {
  @IsInt()
  @Min(0)
  @Max(100)
  grade!: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  feedback?: string;
}

export class AssignmentQueryDto {
  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;

  @IsOptional()
  @IsUUID('7')
  programId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/** Student/guardian portal query. */
export class PortalAssignmentsQueryDto {
  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;
}
