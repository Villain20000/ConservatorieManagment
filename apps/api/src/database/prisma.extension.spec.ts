import { describe, expect, it, vi } from 'vitest';
import { softDeleteExtension } from './prisma.extension.js';

const ACTOR_ID = '00000000-0000-4000-8000-000000000001';

const READ_OPERATIONS = [
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
] as const;

interface ExtensionConfig {
  name?: string;
  query: { $allModels: { $allOperations: (params: HandlerParams) => Promise<unknown> } };
}

interface HandlerParams {
  model: string;
  operation: string;
  args: unknown;
  query: (args?: unknown) => Promise<unknown>;
}

interface DelegateStub {
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
}

/**
 * The extension is a `Prisma.defineExtension` thunk: it receives a client and
 * returns the config handed to `$extends`. Feeding it a fake client lets us
 * invoke the captured handler directly, with no database and no Prisma runtime.
 */
function harness(actorId: string | null = ACTOR_ID) {
  let captured: ExtensionConfig | undefined;

  const delegates: Record<string, DelegateStub> = {
    student: { update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
    teacher: { update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
    documentRecord: { update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
    lessonSeries: { update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
    announcement: { update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
    charge: { update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
  };

  const fakeClient = {
    ...delegates,
    $extends: (config: ExtensionConfig) => {
      captured = config;
      return fakeClient;
    },
  };

  const extension = softDeleteExtension({ actorId: () => actorId });
  (extension as unknown as (client: unknown) => unknown)(fakeClient);

  if (!captured) {
    throw new Error('extension did not call $extends');
  }

  const handler = captured.query.$allModels.$allOperations;
  return { handler, delegates };
}

function passthroughQuery() {
  return vi.fn(async (args?: unknown) => args);
}

describe('softDeleteExtension', () => {
  it.each(READ_OPERATIONS)('injects deletedAt: null into %s', async (operation) => {
    const { handler } = harness();
    const query = passthroughQuery();

    await handler({
      model: 'Student',
      operation,
      args: { where: { tenantId: 'tenant-1' } },
      query,
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', deletedAt: null } });
  });

  it.each(READ_OPERATIONS)('injects deletedAt: null into %s when where is absent', async (operation) => {
    const { handler } = harness();
    const query = passthroughQuery();

    await handler({ model: 'Announcement', operation, args: {}, query });

    expect(query).toHaveBeenCalledWith({ where: { deletedAt: null } });
  });

  it.each(READ_OPERATIONS)('leaves an explicit deletedAt filter untouched for %s', async (operation) => {
    const { handler } = harness();
    const query = passthroughQuery();
    const args = { where: { tenantId: 'tenant-1', deletedAt: { not: null } } };

    await handler({ model: 'DocumentRecord', operation, args, query });

    expect(query).toHaveBeenCalledTimes(1);
    // Same reference: the escape hatch must not be rebuilt or merged.
    expect(query.mock.calls[0]?.[0]).toBe(args);
  });

  it('rewrites delete into an update stamped with the actor', async () => {
    const { handler, delegates } = harness();
    const query = passthroughQuery();
    const where = { id: 'student-1' };

    await handler({ model: 'Student', operation: 'delete', args: { where }, query });

    expect(query).not.toHaveBeenCalled();
    expect(delegates.student.update).toHaveBeenCalledTimes(1);
    const call = delegates.student.update.mock.calls[0]?.[0] as {
      where: unknown;
      data: { deletedAt: Date; deletedById: string | null };
    };
    expect(call.where).toEqual(where);
    expect(call.data.deletedAt).toBeInstanceOf(Date);
    expect(call.data.deletedById).toBe(ACTOR_ID);
  });

  it('maps PascalCase model names onto camelCase delegates', async () => {
    const { handler, delegates } = harness();

    await handler({
      model: 'DocumentRecord',
      operation: 'delete',
      args: { where: { id: 'doc-1' } },
      query: passthroughQuery(),
    });

    expect(delegates.documentRecord.update).toHaveBeenCalledTimes(1);
  });

  it('records a null actor when there is no session user', async () => {
    const { handler, delegates } = harness(null);

    await handler({
      model: 'Teacher',
      operation: 'delete',
      args: { where: { id: 'teacher-1' } },
      query: passthroughQuery(),
    });

    const call = delegates.teacher.update.mock.calls[0]?.[0] as {
      data: { deletedById: string | null };
    };
    expect(call.data.deletedById).toBeNull();
  });

  it('rewrites deleteMany into updateMany scoped to live rows', async () => {
    const { handler, delegates } = harness();

    await handler({
      model: 'LessonSeries',
      operation: 'deleteMany',
      args: { where: { tenantId: 'tenant-1', status: 'ACTIVE' } },
      query: passthroughQuery(),
    });

    expect(delegates.lessonSeries.updateMany).toHaveBeenCalledTimes(1);
    const call = delegates.lessonSeries.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: { deletedAt: Date; deletedById: string | null };
    };
    expect(call.where).toEqual({ tenantId: 'tenant-1', status: 'ACTIVE', deletedAt: null });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
    expect(call.data.deletedById).toBe(ACTOR_ID);
  });

  it('rewrites deleteMany with no where into a live-rows updateMany', async () => {
    const { handler, delegates } = harness();

    await handler({
      model: 'Announcement',
      operation: 'deleteMany',
      args: {},
      query: passthroughQuery(),
    });

    const call = delegates.announcement.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toEqual({ deletedAt: null });
  });

  it('passes a non-soft model through byte-identical', async () => {
    const { handler, delegates } = harness();
    const query = passthroughQuery();
    const args = { where: { tenantId: 'tenant-1' }, orderBy: { dueDate: 'desc' } };

    await handler({ model: 'Charge', operation: 'findMany', args, query });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toBe(args);
    expect(delegates.charge.update).not.toHaveBeenCalled();
  });

  it('does not intercept update, so restore stays reachable', async () => {
    const { handler, delegates } = harness();
    const query = passthroughQuery();
    const args = { where: { id: 'student-1' }, data: { deletedAt: null } };

    await handler({ model: 'Student', operation: 'update', args, query });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toBe(args);
    expect(delegates.student.update).not.toHaveBeenCalled();
  });

  it('does not intercept updateMany', async () => {
    const { handler, delegates } = harness();
    const query = passthroughQuery();
    const args = { where: { tenantId: 'tenant-1' }, data: { deletedAt: null } };

    await handler({ model: 'Student', operation: 'updateMany', args, query });

    expect(query.mock.calls[0]?.[0]).toBe(args);
    expect(delegates.student.updateMany).not.toHaveBeenCalled();
  });
});
