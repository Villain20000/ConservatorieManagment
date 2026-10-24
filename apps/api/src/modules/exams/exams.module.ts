import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { ExamsController, StudentExamsController } from './exams.controller.js';
import { ExamsService } from './exams.service.js';

@Module({
  imports: [DocumentsModule],
  controllers: [ExamsController, StudentExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
