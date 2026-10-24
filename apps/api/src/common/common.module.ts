import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { NotificationsService } from './notifications.service.js';
import { ScopeService } from './scope.service.js';
import { TenantContextService } from './tenant-context.service.js';

@Global()
@Module({
  providers: [TenantContextService, AuditService, ScopeService, NotificationsService],
  exports: [TenantContextService, AuditService, ScopeService, NotificationsService],
})
export class CommonModule {}
