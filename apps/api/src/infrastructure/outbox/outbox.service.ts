import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

export interface OutboxInput {
  type: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: OutboxInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.outboxMessage.createMany({
      data: [
        {
          dedupeKey: input.dedupeKey,
          type: input.type,
          payloadJson: input.payload as Prisma.InputJsonValue,
        },
      ],
      skipDuplicates: true,
    });
  }
}
