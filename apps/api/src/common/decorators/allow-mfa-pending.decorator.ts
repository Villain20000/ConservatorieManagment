import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as reachable by an authenticated user whose second factor is
 * still pending — i.e. someone who may not yet have enrolled in MFA.
 *
 * `JwtAuthGuard` refuses MFA-pending principals by default; only handlers
 * carrying this metadata (status, enrol, activate, disable, recovery-code
 * regeneration) are allowed through.
 */
export const ALLOW_MFA_PENDING_KEY = 'allowMfaPending';

export const AllowMfaPending = () => SetMetadata(ALLOW_MFA_PENDING_KEY, true);
