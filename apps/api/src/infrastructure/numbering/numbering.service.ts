import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { NumberScope } from '../../generated/prisma/enums.js';

export interface NumberFormat {
  scope: NumberScope;
  period: number;
  prefix: string;
}

@Injectable()
export class NumberingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
  ) {}

  async next(format: NumberFormat, tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? this.prisma;
    const tenantId = this.ctx.tenantId;
    const rows = await client.$queryRaw<{ value: number }[]>`
      INSERT INTO "number_sequences"
        ("id", "tenantId", "scope", "period", "prefix", "value", "createdAt", "updatedAt")
      VALUES
        (gen_random_uuid(), ${tenantId}::uuid, ${format.scope}::"NumberScope", ${format.period}, ${format.prefix}, 1, now(), now())
      ON CONFLICT ("tenantId", "scope", "period")
      DO UPDATE SET
        "value" = "number_sequences"."value" + 1,
        "updatedAt" = now()
      RETURNING "value"
    `;
    const value = Number(rows[0]?.value ?? 1);
    return `${format.prefix}-${format.period}-${String(value).padStart(6, '0')}`;
  }

  async nextReceipt(tx?: Prisma.TransactionClient): Promise<string> {
    return this.next({ scope: 'RECEIPT', period: new Date().getFullYear(), prefix: 'REC' }, tx);
  }

  async nextDocument(tx?: Prisma.TransactionClient): Promise<string> {
    return this.next({ scope: 'DOCUMENT', period: new Date().getFullYear(), prefix: 'PRT' }, tx);
  }
}
