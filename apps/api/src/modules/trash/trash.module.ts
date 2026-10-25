import { Module } from '@nestjs/common';
import { TrashController, TrashPermissionGuard } from './trash.controller.js';
import { TrashService } from './trash.service.js';

@Module({
  controllers: [TrashController],
  providers: [TrashService, TrashPermissionGuard],
})
export class TrashModule {}
