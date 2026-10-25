import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { CommonModule } from './common/common.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { FeatureGuard } from './common/guards/feature.guard.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';
import { SupportAccessGuard } from './common/guards/support-access.guard.js';
import { TenantStateGuard } from './common/guards/tenant-state.guard.js';
import { PrismaModule } from './database/prisma.module.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { AcademicsModule } from './modules/academics/academics.module.js';
import { AnnouncementsModule } from './modules/announcements/announcements.module.js';
import { AssignmentsModule } from './modules/assignments/assignments.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { ExamsModule } from './modules/exams/exams.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PeopleModule } from './modules/people/people.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { PortalModule } from './modules/portal/portal.module.js';
import { SchedulingModule } from './modules/scheduling/scheduling.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';
import { TrashModule } from './modules/trash/trash.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        // Honour an inbound correlation id (from a proxy or a client) so logs
        // line up across hops, otherwise mint one.
        idGenerator: (req: { headers?: Record<string, unknown> }) => {
          const inbound = req.headers?.['x-request-id'];
          return typeof inbound === 'string' && inbound.length > 0 && inbound.length <= 200
            ? inbound
            : randomUUID();
        },
        setup: (cls, req, res) => {
          cls.set('req', {
            method: req.method,
            path: req.originalUrl ?? req.url,
          });
          res.setHeader('x-request-id', cls.getId());
        },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CommonModule,
    InfrastructureModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    AcademicsModule,
    PeopleModule,
    SchedulingModule,
    AttendanceModule,
    AnnouncementsModule,
    AssignmentsModule,
    DashboardModule,
    FinanceModule,
    ExamsModule,
    DocumentsModule,
    PlatformModule,
    PortalModule,
    TrashModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Support grants swap the platform session for a read-only tenant session,
    // so they must run before tenant state is evaluated for the target tenant.
    { provide: APP_GUARD, useClass: SupportAccessGuard },
    // Tenant state must run before the feature guard so a suspended tenant reads
    // as TENANT_SUSPENDED rather than FEATURE_NOT_IN_PLAN.
    { provide: APP_GUARD, useClass: TenantStateGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Last, because it is the only guard that costs an extra plan read and it
    // only applies to routes annotated with @RequiresFeature.
    { provide: APP_GUARD, useClass: FeatureGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
