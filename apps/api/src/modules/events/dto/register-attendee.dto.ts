import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { RsvpStatus } from '../../../generated/prisma/enums.js';

export class RegisterAttendeeDto {
  @IsString()
  @IsNotEmpty()
  attendeeName!: string;

  @IsEmail()
  @IsNotEmpty()
  attendeeEmail!: string;

  @IsString()
  @IsOptional()
  attendeePhone?: string;

  @IsUUID()
  @IsOptional()
  studentId?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  ticketCount?: number;

  @IsBoolean()
  @IsOptional()
  isVip?: boolean;

  @IsString()
  @IsOptional()
  seatNumber?: string;

  @IsEnum(RsvpStatus)
  @IsOptional()
  rsvpStatus?: RsvpStatus;
}
