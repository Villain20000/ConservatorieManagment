import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NumberingService } from '../src/infrastructure/numbering/numbering.service.js';

describe('NumberingService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
  });
  let tenantId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Numbering test',
        slug: `numbering-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    // Sequences cascade with the tenant, but deleting them explicitly keeps the
    // test independent of that cascade.
    await prisma.numberSequence.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('allocates unique sequential numbers under concurrency', async () => {
    const service = new NumberingService(prisma as never, { tenantId } as never);

    const numbers = await Promise.all(
      Array.from({ length: 25 }, () =>
        service.next({ scope: 'RECEIPT', period: 2031, prefix: 'TST' }),
      ),
    );

    // The shared dev database may already contain a TST-2031 sequence from a
    // previous run; what matters is that the batch is unique and contiguous.
    expect(new Set(numbers).size).toBe(numbers.length);
    const values = numbers
      .map((number) => Number(number.split('-')[2]))
      .sort((a, b) => a - b);
    expect(numbers.every((number) => /^TST-2031-\d{6}$/.test(number))).toBe(true);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBe(values[index - 1] + 1);
    }
  });

  it('keeps independent sequences per scope and period', async () => {
    const service = new NumberingService(prisma as never, { tenantId } as never);

    const receipt = await service.next({ scope: 'RECEIPT', period: 2032, prefix: 'RCP' });
    const document = await service.next({ scope: 'DOCUMENT', period: 2032, prefix: 'DOC' });
    const nextReceipt = await service.next({ scope: 'RECEIPT', period: 2032, prefix: 'RCP' });

    expect(receipt).toBe('RCP-2032-000001');
    expect(document).toBe('DOC-2032-000001');
    expect(nextReceipt).toBe('RCP-2032-000002');
  });
});
