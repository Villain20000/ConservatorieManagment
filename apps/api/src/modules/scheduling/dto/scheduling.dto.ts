import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMilitaryTime,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CalendarDayKind,
  LessonStatus,
  LessonType,
  SeriesStatus,
} from '../../../generated/prisma/enums.js';

export class SeriesQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  programId?: string;

  @IsOptional()
  @IsEnum(SeriesStatus)
  status?: SeriesStatus;
}

export class CreateLessonSeriesDto {
  @IsString()
  branchId!: string;

  @IsString()
  roomId!: string;

  @IsString()
  teacherId!: string;

  @IsString()
  programId!: string;

  @IsOptional()
  @IsString()
  levelId?: string;

  @IsEnum(LessonType)
  type!: LessonType;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @IsMilitaryTime()
  startTime!: string;

  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes!: number;

  @IsDateString()
  validFrom!: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  studentIds?: string[];

  @IsOptional()
  @IsEnum(SeriesStatus)
  status?: SeriesStatus;
}

export class UpdateLessonSeriesDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  programId?: string;

  @IsOptional()
  @IsString()
  levelId?: string | null;

  @IsOptional()
  @IsEnum(LessonType)
  type?: LessonType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;

  @IsOptional()
  @IsMilitaryTime()
  startTime?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  studentIds?: string[];

  @IsOptional()
  @IsEnum(SeriesStatus)
  status?: SeriesStatus;
}

export class LessonQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  programId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsEnum(LessonStatus)
  status?: LessonStatus;
}

export class RescheduleLessonDto {
  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CancelLessonDto {
  @IsString()
  @MaxLength(300)
  reason!: string;
}

export class ConflictCheckDto {
  @IsString()
  teacherId!: string;

  @IsString()
  roomId!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  studentIds?: string[];

  @IsOptional()
  @IsString()
  excludeLessonId?: string;

  @IsOptional()
  @IsString()
  excludeSeriesId?: string;
}

/** ISO calendar date (`yyyy-MM-dd`) — stored as `DATE`, never shifted by a zone. */
export class CalendarDayQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class CalendarDayInputDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Η ημερομηνία πρέπει να έχει μορφή ΕΕ-Μ-Η' })
  date!: string;

  @IsEnum(CalendarDayKind)
  kind!: CalendarDayKind;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;
}
