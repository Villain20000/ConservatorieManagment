import { Prisma } from '../generated/prisma/client.js';

/**
 * Soft-delete query extension.
 *
 * Live rows are the ones with `deletedAt IS NULL`; every model that opted into
 * soft deletes keeps that column nullable, so no backfill was required.
 *
 * Intercepted operations:
 *  - reads (`findMany`, `findFirst`, `findFirstOrThrow`, `findUnique`,
 *    `findUniqueOrThrow`, `count`, `aggregate`, `groupBy`) get `deletedAt: null`
 *    injected unless the caller already supplied `where.deletedAt` — that is
 *    the typed escape hatch used by the trash views (`{ not: null }`).
 *  - `delete` is rewritten to an `update` stamping `deletedAt` / `deletedById`.
 *  - `deleteMany` is rewritten to an `updateMany` over the live rows only.
 *  - `update` / `updateMany` are deliberately NOT intercepted: restoring a row
 *    is an ordinary `update({ data: { deletedAt: null } })`, and intercepting
 *    updates would make restore unreachable.
 *
 * KNOWN LIMITATION — relations bypass this extension. A nested `include` or
 * `select` on a relation (e.g. `lessonSeries.findMany({ include: { teacher } })`)
 * is resolved by Prisma inside the same query, so the related soft-deleted rows
 * are NOT filtered. Any service that traverses a soft model through an include
 * must filter it explicitly (`where: { deletedAt: null }` inside the relation
 * argument) or resolve the relation separately through this extension.
 */

const SOFT_MODELS = new Set<string>([
  'Student',
  'Teacher',
  'DocumentRecord',
  'LessonSeries',
  'Announcement',
]);

const READ_OPERATIONS = new Set<string>([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

interface OperationArgs {
  where?: Record<string, unknown>;
  [key: string]: unknown;
}

interface SoftDeleteDelegate {
  update(args: { where: unknown; data: Record<string, unknown> }): Promise<unknown>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
}

/** Prisma hands us PascalCase model names; the client exposes camelCase delegates. */
function delegateKey(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** The unextended client is used for rewrites so the extension cannot recurse. */
function delegateFor(client: unknown, model: string): SoftDeleteDelegate {
  return (client as Record<string, SoftDeleteDelegate>)[delegateKey(model)];
}

function mentionsDeletedAt(where: Record<string, unknown> | undefined): boolean {
  return where !== undefined && Object.prototype.hasOwnProperty.call(where, 'deletedAt');
}

export function softDeleteExtension(options: { actorId: () => string | null }) {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: 'soft-delete',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model || !SOFT_MODELS.has(model)) {
              return query(args);
            }

            const input = (args ?? {}) as unknown as OperationArgs;

            if (READ_OPERATIONS.has(operation)) {
              if (mentionsDeletedAt(input.where)) {
                return query(args);
              }
              return query({
                ...input,
                where: { ...(input.where ?? {}), deletedAt: null },
              } as unknown as typeof args);
            }

            const stamp = {
              deletedAt: new Date(),
              deletedById: options.actorId(),
            };

            if (operation === 'delete') {
              return delegateFor(client, model).update({ where: input.where, data: stamp });
            }

            if (operation === 'deleteMany') {
              return delegateFor(client, model).updateMany({
                where: { ...(input.where ?? {}), deletedAt: null },
                data: stamp,
              });
            }

            return query(args);
          },
        },
      },
    }),
  );
}
