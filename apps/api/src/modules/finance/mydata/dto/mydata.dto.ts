import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto.js';

export class TransmitPaymentDto {
  @IsOptional()
  @IsString()
  invoiceType?: string = '11.2';

  @IsOptional()
  @IsString()
  series?: string = 'A';

  @IsOptional()
  @IsString()
  aa?: string;

  @IsOptional()
  @IsString()
  counterpartyTaxId?: string;

  @IsOptional()
  @IsString()
  counterpartyName?: string;
}

export class CancelTransmissionDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}

export class MyDataQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  statusCode?: string;

  @IsOptional()
  @IsString()
  invoiceType?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
