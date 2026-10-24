import {
  IsBase64,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DocumentStatus, DocumentType } from '../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class DocumentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  examId?: string;

  /** Inclusive lower bound (ISO date) applied to the issue date. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive upper bound (ISO date) applied to the issue date. */
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class IssueDocumentDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  examId?: string;

  @IsEnum(DocumentType)
  type!: DocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  templateKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}

export class ArchiveDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export const ATTACHABLE_CONTENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

export class AttachDocumentFileDto {
  @IsString()
  @MaxLength(200)
  fileName!: string;

  @IsString()
  @IsIn([...ATTACHABLE_CONTENT_TYPES])
  contentType!: string;

  @IsString()
  @IsBase64()
  contentBase64!: string;
}
