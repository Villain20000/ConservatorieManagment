import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

@Module({
  imports: [DocumentsModule, AssignmentsModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
