import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import type { SessionUser, SupportGrant, SupportSession } from './models';
import {
  SUPPORT_STORAGE_KEY,
  readStoredSupportSession,
} from './support-session';
import { SupportService } from './support.service';

const USER: SessionUser = {
  id: 'user-1',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Admin',
  locale: 'en',
  isPlatformAdmin: true,
};

function makeGrant(overrides: Partial<SupportGrant> = {}): SupportGrant {
  const now = Date.now();
  return {
    id: 'grant-1',
    tenantId: 'tenant-1',
    reason: 'Investigate a reported billing issue',
    ticketRef: 'SUP-1',
    status: 'ACTIVE',
    expiresAt: new Date(now + 5 * 60_000).toISOString(),
    usedAt: null,
    revokedAt: null,
    createdAt: new Date(now).toISOString(),
    tenant: { id: 'tenant-1', name: 'Test Conservatory', slug: 'test' },
    actor: { id: USER.id, firstName: 'Ada', lastName: 'Admin', email: USER.email },
    ...overrides,
  };
}

function makeSession(grant = makeGrant()): SupportSession {
  return { grant, tenant: grant.tenant };
}

function createAuthMock() {
  const authenticated = signal(true);
  const supportActive = signal(false);
  return {
    isAuthenticated: authenticated,
    user: signal<SessionUser | null>(USER),
    supportActive,
    isSupportSession: computed(() => supportActive()),
    enterSupport: vi.fn((_session: SupportSession) => {
      supportActive.set(true);
    }),
    exitSupport: vi.fn(async () => {
      supportActive.set(false);
    }),
  };
}

describe('SupportService', () => {
  let service: SupportService;
  let http: HttpTestingController;
  let auth: ReturnType<typeof createAuthMock>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    auth = createAuthMock();
    navigateByUrl = vi.fn(() => Promise.resolve(true));

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigateByUrl } },
        { provide: AuthService, useValue: auth },
      ],
    });

    service = TestBed.inject(SupportService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('stores the grant, enters the auth support context, and seeds the countdown', () => {
    const session = makeSession();

    service.enter(session);

    expect(service.active()).toBe(true);
    expect(service.session()).toEqual(session);
    expect(auth.enterSupport).toHaveBeenCalledWith(session);
    expect(service.remainingMs()).toBeGreaterThan(0);
    expect(JSON.parse(sessionStorage.getItem(SUPPORT_STORAGE_KEY) ?? 'null')).toEqual(session);
  });

  it('clears storage, signals, and returns to the platform on exit', async () => {
    service.enter(makeSession());

    await service.exit();

    expect(service.active()).toBe(false);
    expect(service.session()).toBeNull();
    expect(service.remainingMs()).toBe(0);
    expect(sessionStorage.getItem(SUPPORT_STORAGE_KEY)).toBeNull();
    expect(auth.exitSupport).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledWith('/platform');
  });

  it('is a no-op restore when nothing is stored', async () => {
    await service.restore();

    expect(service.active()).toBe(false);
    expect(auth.enterSupport).not.toHaveBeenCalled();
    http.expectNone('/api/platform/support-grants/grant-1');
  });

  it('restores a stored ACTIVE grant after validating it through the API', async () => {
    sessionStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(makeSession()));

    const restore = service.restore();
    const request = http.expectOne('/api/platform/support-grants/grant-1');
    expect(request.request.method).toBe('GET');
    request.flush(makeGrant());
    await restore;

    expect(service.active()).toBe(true);
    expect(auth.enterSupport).toHaveBeenCalledTimes(1);
    expect(auth.enterSupport.mock.calls[0][0].tenant.name).toBe('Test Conservatory');
  });

  it('clears a revoked grant instead of entering support', async () => {
    sessionStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(makeSession()));

    const restore = service.restore();
    http.expectOne('/api/platform/support-grants/grant-1').flush(
      makeGrant({ status: 'REVOKED', revokedAt: new Date().toISOString() }),
    );
    await restore;

    expect(service.active()).toBe(false);
    expect(auth.enterSupport).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SUPPORT_STORAGE_KEY)).toBeNull();
  });

  it('clears a stale ACTIVE grant whose expiry has passed', async () => {
    sessionStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(makeSession()));

    const restore = service.restore();
    http.expectOne('/api/platform/support-grants/grant-1').flush(
      makeGrant({ expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    );
    await restore;

    expect(service.active()).toBe(false);
    expect(auth.enterSupport).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SUPPORT_STORAGE_KEY)).toBeNull();
  });

  it('clears the stored grant when validation fails', async () => {
    sessionStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(makeSession()));

    const restore = service.restore();
    http
      .expectOne('/api/platform/support-grants/grant-1')
      .flush({}, { status: 404, statusText: 'Not Found' });
    await restore;

    expect(service.active()).toBe(false);
    expect(sessionStorage.getItem(SUPPORT_STORAGE_KEY)).toBeNull();
  });

  it('does not restore a grant for an unauthenticated session', async () => {
    sessionStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(makeSession()));
    auth.isAuthenticated.set(false);

    await service.restore();

    expect(service.active()).toBe(false);
    expect(sessionStorage.getItem(SUPPORT_STORAGE_KEY)).toBeNull();
    http.expectNone('/api/platform/support-grants/grant-1');
  });

  it('exits at client-side expiry and navigates to the platform', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const grant = makeGrant({ expiresAt: new Date(Date.now() + 10_000).toISOString() });

    service.enter(makeSession(grant));
    expect(service.remainingMs()).toBe(10_000);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(service.active()).toBe(false);
    expect(sessionStorage.getItem(SUPPORT_STORAGE_KEY)).toBeNull();
    expect(auth.exitSupport).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledWith('/platform');
  });

  it('refreshes the remaining time on the 30-second tick', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    service.enter(makeSession());
    expect(service.remainingMs()).toBe(5 * 60_000);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(service.remainingMs()).toBe(4.5 * 60_000);
  });

  it('drops support state without navigating when authentication ends', () => {
    service.enter(makeSession());

    auth.isAuthenticated.set(false);
    TestBed.tick();

    expect(service.active()).toBe(false);
    expect(sessionStorage.getItem(SUPPORT_STORAGE_KEY)).toBeNull();
    expect(auth.exitSupport).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('leaves support mode when auth no longer carries the grant', async () => {
    service.enter(makeSession());

    auth.supportActive.set(false);
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();

    expect(service.active()).toBe(false);
    expect(navigateByUrl).toHaveBeenCalledWith('/platform');
  });
});

describe('readStoredSupportSession', () => {
  afterEach(() => sessionStorage.clear());

  it('returns a valid stored session', () => {
    const session = makeSession();
    sessionStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(session));

    expect(readStoredSupportSession()).toEqual(session);
  });

  it('returns null for malformed JSON', () => {
    sessionStorage.setItem(SUPPORT_STORAGE_KEY, '{not json');

    expect(readStoredSupportSession()).toBeNull();
  });

  it('returns null for a payload without a grant', () => {
    sessionStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify({ tenant: makeGrant().tenant }));

    expect(readStoredSupportSession()).toBeNull();
  });

  it('returns null when the grant and tenant disagree', () => {
    const session = makeSession();
    sessionStorage.setItem(
      SUPPORT_STORAGE_KEY,
      JSON.stringify({ ...session, tenant: { ...session.tenant, id: 'tenant-2' } }),
    );

    expect(readStoredSupportSession()).toBeNull();
  });

  it('returns null for an unknown grant status', () => {
    const session = makeSession();
    sessionStorage.setItem(
      SUPPORT_STORAGE_KEY,
      JSON.stringify({ ...session, grant: { ...session.grant, status: 'PENDING' } }),
    );

    expect(readStoredSupportSession()).toBeNull();
  });
});
