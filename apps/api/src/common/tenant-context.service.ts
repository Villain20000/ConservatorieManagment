import { ForbiddenException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { RequestUser, Role } from './types/request-user.js';

@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService) {}

  get user(): RequestUser {
    const user = this.cls.get<RequestUser>('user');
    if (!user) {
      throw new ForbiddenException('Δεν υπάρχει ενεργή συνεδρία');
    }
    return user;
  }

  get tenantId(): string {
    const tenantId = this.cls.get<string>('tenantId');
    if (!tenantId) {
      throw new ForbiddenException('Απαιτείται ενεργό ωδείο');
    }
    return tenantId;
  }

  get tenantIdOrNull(): string | null {
    return this.cls.get<string>('tenantId') ?? null;
  }

  get role(): Role | null {
    return this.cls.get<RequestUser>('user')?.role ?? null;
  }

  get userId(): string {
    return this.user.userId;
  }

  isRole(...roles: Role[]): boolean {
    const role = this.role;
    return role !== null && roles.includes(role);
  }
}
