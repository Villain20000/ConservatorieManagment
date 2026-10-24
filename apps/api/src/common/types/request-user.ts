export type Role = 'DIRECTOR' | 'ADMINISTRATOR' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';

export interface RequestUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  isPlatformAdmin: boolean;
  tenantId?: string;
  membershipId?: string;
  branchId?: string | null;
  role?: Role;
  permissions: string[];
}
