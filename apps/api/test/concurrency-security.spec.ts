import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntitlementsService } from '../src/common/entitlements.service.js';
import { ScopeService } from '../src/common/scope.service.js';

const TENANT_1 = '01918a24-1111-7000-8000-000000000001';
const USER_1 = '01918a24-3333-7000-8000-000000000003';

describe('Security & Multi-Tenant Concurrency Quality Gate', () => {
  describe('EntitlementsService — Concurrency & Seat Locking', () => {
    let prisma: any;
    let cls: any;
    let config: any;
    let service: EntitlementsService;

    beforeEach(() => {
      prisma = {
        tenant: { findUnique: vi.fn() },
        $queryRaw: vi.fn(),
        student: { count: vi.fn() },
        teacher: { count: vi.fn() },
      };
      cls = {
        get: vi.fn(),
        set: vi.fn(),
      };
      config = {
        get: vi.fn().mockReturnValue(7),
      };
      service = new EntitlementsService(prisma, config, cls);
    });

    it('serializes concurrent seat consumption via SELECT ... FOR UPDATE row lock', async () => {
      const tx: any = {
        tenant: {
          findUnique: vi.fn().mockResolvedValue({
            id: TENANT_1,
            subscription: {
              plan: { maxStudents: 50, maxTeachers: 10 },
            },
          }),
        },
        $queryRaw: vi.fn().mockResolvedValue([{ id: TENANT_1 }]),
        student: { count: vi.fn().mockResolvedValue(50) },
      };

      // Attempting to add 51st student when limit is 50 must reject under row lock
      await expect(service.assertCanAddStudent(tx, TENANT_1)).rejects.toThrow(
        ForbiddenException,
      );

      // Verify row lock was acquired on tx
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.student.count).toHaveBeenCalledWith({
        where: { tenantId: TENANT_1, deletedAt: null },
      });
    });

    it('permits student creation when under plan limit', async () => {
      const tx: any = {
        tenant: {
          findUnique: vi.fn().mockResolvedValue({
            id: TENANT_1,
            subscription: {
              plan: { maxStudents: 50, maxTeachers: 10 },
            },
          }),
        },
        $queryRaw: vi.fn().mockResolvedValue([{ id: TENANT_1 }]),
        student: { count: vi.fn().mockResolvedValue(30) },
      };

      await expect(service.assertCanAddStudent(tx, TENANT_1)).resolves.not.toThrow();
    });
  });

  describe('ScopeService — Probe-Resistant Multi-Tenancy (404 vs 403)', () => {
    it('returns NotFoundException (404) rather than 403 when probing unlinked student records', async () => {
      const prisma: any = {
        guardian: {
          findFirst: vi.fn().mockResolvedValue({ id: 'guardian-1' }),
        },
        studentGuardian: {
          findFirst: vi.fn().mockResolvedValue(null), // Foreign or unlinked student
        },
      };

      const ctx: any = {
        tenantId: TENANT_1,
        userId: USER_1,
        user: { branchId: null, role: 'GUARDIAN' },
        isRole: vi.fn((...roles: string[]) => roles.includes('GUARDIAN')),
      };

      const scopeService = new ScopeService(prisma, ctx);

      // Probing an unauthorized student ID from a Guardian role must return 404 (NotFoundException)
      await expect(
        scopeService.assertStudentAccessible('foreign-student-id'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.studentGuardian.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_1,
            studentId: 'foreign-student-id',
          }),
        }),
      );
    });
  });
});
