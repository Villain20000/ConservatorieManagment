import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { EventType } from '../../../generated/prisma/enums.js';

export class CreateEventDto {
  @IsUUID()
  @IsNotEmpty()
  branchId!: string;

  @IsUUID()
  @IsOptional()
  roomId?: string;

  @IsUUID()
  @IsOptional()
  academicYearId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsEnum(EventType)
  @IsOptional()
  eventType?: EventType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsISO8601()
  @IsNotEmpty()
  startsAt!: string;

  @IsISO8601()
  @IsNotEmpty()
  endsAt!: string;

  @IsISO8601()
  @IsOptional()
  doorsOpenAt?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxCapacity?: number;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresRegistration?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  ticketPriceCents?: number;

  @IsString()
  @IsOptional()
  programNotes?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  intermissionDurationMinutes?: number;
}
