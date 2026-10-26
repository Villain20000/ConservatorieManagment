import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { EventStatus, EventType } from '../../../generated/prisma/enums.js';

export class EventQueryDto extends PaginationQueryDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsEnum(EventType)
  @IsOptional()
  eventType?: EventType;

  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;

  @IsISO8601()
  @IsOptional()
  from?: string;

  @IsISO8601()
  @IsOptional()
  to?: string;
}
