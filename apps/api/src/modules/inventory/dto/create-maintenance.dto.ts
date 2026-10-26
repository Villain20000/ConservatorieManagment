import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { MaintenanceType } from '../../../generated/prisma/enums.js';

export class CreateMaintenanceDto {
  @IsUUID()
  @IsNotEmpty()
  assetId!: string;

  @IsEnum(MaintenanceType)
  @IsNotEmpty()
  maintenanceType!: MaintenanceType;

  @IsString()
  @IsNotEmpty()
  technicianName!: string;

  @IsString()
  @IsOptional()
  technicianCompany?: string;

  @IsString()
  @IsOptional()
  technicianPhone?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  costCents?: number;

  @IsISO8601()
  @IsNotEmpty()
  serviceDate!: string;

  @IsISO8601()
  @IsOptional()
  nextServiceDue?: string;

  @IsNumber()
  @IsOptional()
  pitchMeasuredHz?: number;

  @IsNumber()
  @IsOptional()
  pitchLeftHz?: number;

  @IsInt()
  @IsOptional()
  humidityPercentage?: number;

  @IsNumber()
  @IsOptional()
  temperatureCelsius?: number;

  @IsString()
  @IsNotEmpty()
  workPerformed!: string;

  @IsString()
  @IsOptional()
  partsReplaced?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  invoiceNumber?: string;
}
