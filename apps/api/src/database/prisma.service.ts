/**
 * The class is only ever constructed inside the `PrismaModule` factory, which
 * immediately wraps it in the soft-delete query extension. Consumers receive
 * that proxy, so `value instanceof PrismaService` is false — use the class as an
 * injection token and as a type only. Lifecycle hooks are owned by
 * `PrismaLifecycle`, since `$extends` proxies do not run them.
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
