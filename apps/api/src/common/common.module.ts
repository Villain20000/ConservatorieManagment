import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { ERROR_REPORTER, LogErrorReporter } from './logging/error-reporter.js';
import { JsonLogger } from './logging/json.logger.js';
import { NotificationsService } from './notifications.service.js';
import { ScopeService } from './scope.service.js';
import { SoftDeleteService } from './soft-delete.service.js';
import { TenantContextService } from './tenant-context.service.js';

@Global()
@Module({
  providers: [
    TenantContextService,
    AuditService,
    ScopeService,
    NotificationsService,
    EntitlementsService,
    SoftDeleteService,
    JsonLogger,
    { provide: ERROR_REPORTER, useClass: LogErrorReporter },
  ],
  exports: [
    TenantContextService,
    AuditService,
    ScopeService,
    NotificationsService,
    EntitlementsService,
    SoftDeleteService,
    JsonLogger,
    ERROR_REPORTER,
  ],
})
export class CommonModule {}
