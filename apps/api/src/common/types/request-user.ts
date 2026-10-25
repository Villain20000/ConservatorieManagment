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
  /** True when the account has TOTP enrolled. */
  mfaEnabled?: boolean;
  /** True when enforcement is on but the account has not enrolled yet. */
  mfaPendingEnrolment?: boolean;
}
