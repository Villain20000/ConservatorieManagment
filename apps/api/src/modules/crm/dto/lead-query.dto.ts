import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { LeadSource, LeadStage } from '../../../generated/prisma/enums.js';

export class LeadQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  programId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}
