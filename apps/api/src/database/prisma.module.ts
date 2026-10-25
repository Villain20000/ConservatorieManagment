import { Global, Injectable, Module } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import type { RequestUser } from '../common/types/request-user.js';
import { softDeleteExtension } from './prisma.extension.js';
import { PrismaService } from './prisma.service.js';

/**
 * `PrismaService` is provided by a factory that returns an extended client, so
 * the value in the container is a Prisma proxy, not an instance of the class.
 * `instanceof PrismaService` is therefore false everywhere — the class survives
 * only as the injection token and as the TypeScript type that services consume.
 *
 * Because Nest lifecycle hooks do not fire on a `$extends` proxy, connect and
 * disconnect are handled by `PrismaLifecycle` below.
 */
@Injectable()
export class PrismaLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      inject: [ConfigService, ClsService],
      useFactory: (config: ConfigService, cls: ClsService) => {
        const base = new PrismaService(config);
        return base.$extends(
          softDeleteExtension({ actorId: () => cls.get<RequestUser>('user')?.userId ?? null }),
        ) as unknown as PrismaService;
      },
    },
    PrismaLifecycle,
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
