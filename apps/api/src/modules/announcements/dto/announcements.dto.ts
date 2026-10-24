import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { MembershipRole } from '../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class AnnouncementQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(MembershipRole)
  audience?: MembershipRole;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  pinnedOnly?: boolean;
}

export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(MembershipRole, { each: true })
  audienceRoles?: MembershipRole[];

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(MembershipRole, { each: true })
  audienceRoles?: MembershipRole[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class NotificationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}
