import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

@Module({
  imports: [DocumentsModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
