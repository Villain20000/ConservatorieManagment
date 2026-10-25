import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  ArchiveDocumentDto,
  AttachDocumentFileDto,
  DocumentQueryDto,
  IssueDocumentDto,
} from './dto/documents.dto.js';
import { DocumentsService } from './documents.service.js';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  list(@Query() query: DocumentQueryDto) {
    return this.documents.list(query);
  }

  @Get('templates')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  templates() {
    return { data: this.documents.templates() };
  }

  @Get('stats')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  stats() {
    return this.documents.stats();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  get(@Param('id') id: string) {
    return this.documents.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  create(@Body() dto: IssueDocumentDto) {
    return this.documents.create(dto);
  }

  @Post(':id/issue')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  issue(@Param('id') id: string) {
    return this.documents.issue(id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  archive(@Param('id') id: string, @Body() dto: ArchiveDocumentDto) {
    return this.documents.archive(id, dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  approve(@Param('id') id: string) {
    return this.documents.approve(id);
  }

  @Post(':id/file')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  attachFile(@Param('id') id: string, @Body() dto: AttachDocumentFileDto) {
    return this.documents.attachFile(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  remove(@Param('id') id: string) {
    return this.documents.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  restore(@Param('id') id: string) {
    return this.documents.restore(id);
  }

  @Get(':id/versions')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  history(@Param('id') id: string) {
    return this.documents.history(id);
  }

  @Get(':id/pdf')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  async pdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.documents.pdfForDocument(id);
    setPdfHeaders(res, fileName, buffer.length);
    return new StreamableFile(buffer);
  }
}

@ApiTags('documents')
@ApiBearerAuth()
@Controller('students')
export class StudentDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get(':id/documents')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  documentsForStudent(@Param('id') id: string) {
    return this.documents.studentDocuments(id);
  }
}

export function setPdfHeaders(res: Response, fileName: string, length: number): void {
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(length));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
}
