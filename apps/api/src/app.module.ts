import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { AppController } from './app.controller.js';
import { CommonModule } from './common/common.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';
import { PrismaModule } from './database/prisma.module.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { AcademicsModule } from './modules/academics/academics.module.js';
import { AnnouncementsModule } from './modules/announcements/announcements.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { ExamsModule } from './modules/exams/exams.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { PeopleModule } from './modules/people/people.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { PortalModule } from './modules/portal/portal.module.js';
import { SchedulingModule } from './modules/scheduling/scheduling.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CommonModule,
    InfrastructureModule,
    AuthModule,
    TenantsModule,
    AcademicsModule,
    PeopleModule,
    SchedulingModule,
    AttendanceModule,
    AnnouncementsModule,
    DashboardModule,
    FinanceModule,
    ExamsModule,
    DocumentsModule,
    PlatformModule,
    PortalModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
