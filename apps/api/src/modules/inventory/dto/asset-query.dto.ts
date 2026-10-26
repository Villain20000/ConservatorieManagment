import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import {
  AssetCategory,
  AssetCondition,
  AssetStatus,
} from '../../../generated/prisma/enums.js';

export class AssetQueryDto extends PaginationQueryDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsUUID()
  @IsOptional()
  studioRoomId?: string;

  @IsEnum(AssetCategory)
  @IsOptional()
  category?: AssetCategory;

  @IsEnum(AssetStatus)
  @IsOptional()
  status?: AssetStatus;

  @IsEnum(AssetCondition)
  @IsOptional()
  condition?: AssetCondition;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  needsTuning?: boolean;
}
