import { IsEnum, IsOptional } from 'class-validator';
import { EventStatus } from '../../../generated/prisma/enums.js';

export class UpdateEventDto {
  @IsOptional()
  branchId?: string;

  @IsOptional()
  roomId?: string;

  @IsOptional()
  academicYearId?: string;

  @IsOptional()
  title?: string;

  @IsOptional()
  slug?: string;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  description?: string;

  @IsOptional()
  startsAt?: string;

  @IsOptional()
  endsAt?: string;

  @IsOptional()
  doorsOpenAt?: string;

  @IsOptional()
  maxCapacity?: number;

  @IsOptional()
  isPublic?: boolean;

  @IsOptional()
  requiresRegistration?: boolean;

  @IsOptional()
  ticketPriceCents?: number;

  @IsOptional()
  programNotes?: string;

  @IsOptional()
  intermissionDurationMinutes?: number;
}
