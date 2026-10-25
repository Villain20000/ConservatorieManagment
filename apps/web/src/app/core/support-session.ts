import type { SupportSession } from './models';

/**
 * The active support grant lives in `sessionStorage`: it must survive a reload
 * but never leak across browser tabs or outlive the browser session.
 */
export const SUPPORT_STORAGE_KEY = 'musicos.support';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Reads the stored support session with a narrow shape check. Corrupt or
 * hand-edited storage is treated as "no session"; the API still validates the
 * grant before a single tenant request is trusted.
 */
export function readStoredSupportSession(): SupportSession | null {
  try {
    const raw = sessionStorage.getItem(SUPPORT_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const grant = parsed['grant'];
    const tenant = parsed['tenant'];
    if (!isRecord(grant) || !isRecord(tenant)) return null;

    const status = grant['status'];
    const validStatus = status === 'ACTIVE' || status === 'REVOKED' || status === 'EXPIRED';
    if (!validStatus) return null;
    if (!isNonEmptyString(grant['id']) || !isNonEmptyString(grant['tenantId'])) return null;
    if (!isNonEmptyString(grant['expiresAt']) || typeof grant['reason'] !== 'string') return null;
    if (!isNonEmptyString(tenant['id']) || !isNonEmptyString(tenant['name'])) return null;
    if (!isNonEmptyString(tenant['slug'])) return null;
    if (grant['tenantId'] !== tenant['id']) return null;

    return parsed as unknown as SupportSession;
  } catch {
    return null;
  }
}

export function clearStoredSupportSession(): void {
  try {
    sessionStorage.removeItem(SUPPORT_STORAGE_KEY);
  } catch {
    // Storage can be blocked; the in-memory state is still authoritative.
  }
}
