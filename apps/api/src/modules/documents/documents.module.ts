import { Module } from '@nestjs/common';
import { DocumentsController, StudentDocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { SignaturesController } from './signatures/signatures.controller.js';
import { SignaturesService } from './signatures/signatures.service.js';

@Module({
  controllers: [
    DocumentsController,
    StudentDocumentsController,
    SignaturesController,
  ],
  providers: [DocumentsService, SignaturesService],
  exports: [DocumentsService, SignaturesService],
})
export class DocumentsModule {}
