import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { homeRouteFor } from '../../core/guards';
import { LanguageService } from '../../core/language.service';
import type { Session } from '../../core/models';
import { ThemeService } from '../../core/theme.service';
import { IconComponent } from '../../shared/ui/icon';

const CHALLENGE_KEY = 'musicos.mfa.challenge';

interface PendingChallenge {
  challengeToken: string;
  expiresAt: string;
}

const TOTP_PATTERN = /^\d{6}$/;
const RECOVERY_PATTERN = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/;

/**
 * The second leg of login. The pending challenge is handed over by the login
 * screen through sessionStorage; without it there is nothing to verify, so the
 * page opens in its expired state.
 */
@Component({
  selector: 'app-mfa-challenge',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, IconComponent],
  template: `
    <div class="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <section
        class="relative hidden overflow-hidden bg-sidebar px-10 py-10 text-sidebar-ink lg:flex lg:min-h-screen lg:flex-col xl:px-14"
      >
        <div
          class="pointer-events-none absolute -right-44 -top-44 h-[30rem] w-[30rem] rounded-full border border-accent/20"
          aria-hidden="true"
        ></div>
        <div
          class="pointer-events-none absolute -right-24 top-10 h-[22rem] w-[22rem] rounded-full border border-accent/10"
          aria-hidden="true"
        ></div>
        <div
          class="pointer-events-none absolute -bottom-56 -left-24 h-[34rem] w-[34rem] rounded-full border border-accent/10"
          aria-hidden="true"
        ></div>
        <div
          class="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/25 to-transparent"
          aria-hidden="true"
        ></div>
        <div
          class="pointer-events-none absolute right-14 top-1/3 hidden w-52 flex-col gap-4 opacity-[0.07] xl:flex"
          aria-hidden="true"
        >
          <span class="h-px w-full bg-accent"></span>
          <span class="h-px w-full bg-accent"></span>
          <span class="h-px w-full bg-accent"></span>
          <span class="h-px w-full bg-accent"></span>
        </div>

        <div class="relative z-10 flex flex-1 flex-col">
          <div class="flex items-center gap-3">
            <span
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-ink shadow-[0_14px_34px_-14px_rgba(201,158,88,0.8)]"
            >
              <app-icon name="music" [size]="22" />
            </span>
            <span class="min-w-0">
              <span class="block text-lg font-semibold tracking-tight text-sidebar-ink-strong">
                {{ 'common.appName' | transloco }}
              </span>
              <span
                class="block text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-ink/55"
              >
                {{ 'common.appTagline' | transloco }}
              </span>
            </span>
          </div>

          <div class="my-auto max-w-xl py-14">
            <p class="eyebrow text-accent!">{{ 'auth.eyebrow' | transloco }}</p>
            <h1
              class="mt-3 whitespace-pre-line text-[2.6rem] font-semibold leading-[1.08] tracking-tight text-sidebar-ink-strong xl:text-[3.1rem]"
            >
              {{ 'auth.heroTitle' | transloco }}
            </h1>
            <p class="mt-5 max-w-lg text-sm leading-relaxed text-sidebar-ink/75">
              {{ 'auth.heroText' | transloco }}
            </p>

            <ul class="mt-10 space-y-5">
              <li class="flex gap-3.5">
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-accent"
                >
                  <app-icon name="music" [size]="18" />
                </span>
                <span class="min-w-0">
                  <span class="block text-[13px] font-semibold text-sidebar-ink-strong">
                    {{ 'auth.feature1Title' | transloco }}
                  </span>
                  <span class="mt-0.5 block text-[12px] leading-relaxed text-sidebar-ink/65">
                    {{ 'auth.feature1Text' | transloco }}
                  </span>
                </span>
              </li>
              <li class="flex gap-3.5">
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-accent"
                >
                  <app-icon name="lock" [size]="18" />
                </span>
                <span class="min-w-0">
                  <span class="block text-[13px] font-semibold text-sidebar-ink-strong">
                    {{ 'auth.feature2Title' | transloco }}
                  </span>
                  <span class="mt-0.5 block text-[12px] leading-relaxed text-sidebar-ink/65">
                    {{ 'auth.feature2Text' | transloco }}
                  </span>
                </span>
              </li>
              <li class="flex gap-3.5">
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-accent"
                >
                  <app-icon name="calendar" [size]="18" />
                </span>
                <span class="min-w-0">
                  <span class="block text-[13px] font-semibold text-sidebar-ink-strong">
                    {{ 'auth.feature3Title' | transloco }}
                  </span>
                  <span class="mt-0.5 block text-[12px] leading-relaxed text-sidebar-ink/65">
                    {{ 'auth.feature3Text' | transloco }}
                  </span>
                </span>
              </li>
            </ul>
          </div>

          <div
            class="flex flex-wrap items-center justify-between gap-2 border-t border-sidebar-line pt-5"
          >
            <span class="inline-flex items-center gap-2 text-[10.5px] text-sidebar-ink/55">
              <app-icon name="lock" [size]="13" class="text-accent" />
              {{ 'auth.secure' | transloco }}
            </span>
            <span class="text-[10.5px] text-sidebar-ink/40">
              {{ 'auth.copyright' | transloco: { year: year } }}
            </span>
          </div>
        </div>
      </section>

      <section
        class="relative flex min-h-screen flex-col overflow-hidden bg-canvas px-5 py-5 sm:px-8 sm:py-7"
      >
        <div
          class="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent-soft/25 via-transparent to-transparent dark:from-accent-soft/10"
          aria-hidden="true"
        ></div>

        <div class="relative flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 lg:hidden">
            <span
              class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
            >
              <app-icon name="music" [size]="18" />
            </span>
            <span>
              <span class="block text-[14px] font-semibold tracking-tight text-ink">
                {{ 'common.appName' | transloco }}
              </span>
              <span class="block text-[8.5px] font-semibold uppercase tracking-[0.16em] text-ink-3">
                {{ 'common.appTagline' | transloco }}
              </span>
            </span>
          </div>

          <div class="ml-auto flex items-center gap-1">
            <button
              type="button"
              class="flex h-8 min-w-9 items-center justify-center rounded-lg px-2 text-[11px] font-bold tracking-wide text-ink-2 transition hover:bg-surface-3 hover:text-ink"
              (click)="language.toggle()"
              [attr.aria-label]="'common.language' | transloco"
            >
              {{ language.current() === 'el' ? 'EL' : 'EN' }}
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-icon-sm"
              (click)="theme.toggle()"
              [attr.aria-label]="'common.theme' | transloco"
            >
              <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="17" />
            </button>
          </div>
        </div>

        <div class="relative flex flex-1 flex-col items-center justify-center py-8 sm:py-10">
          <div class="w-full max-w-md">
            <div class="card p-6 sm:p-8">
              <div class="flex min-h-[23rem] flex-col justify-center">
                @if (expired()) {
                  <div role="alert">
                    <span
                      class="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning-soft text-warning"
                    >
                      <app-icon name="clock" [size]="22" />
                    </span>
                    <h1 class="mt-4 text-[1.4rem] font-semibold tracking-tight text-ink">
                      {{ 'auth.mfa.expired' | transloco }}
                    </h1>
                    <p class="mt-2 text-[13px] leading-relaxed text-ink-2">
                      {{ 'auth.mfa.expiredHint' | transloco }}
                    </p>
                    <a routerLink="/login" class="btn btn-primary mt-6 h-11 w-full text-sm">
                      <app-icon name="arrow-left" [size]="16" />
                      {{ 'auth.backToLogin' | transloco }}
                    </a>
                  </div>
                } @else {
                  <p class="eyebrow">{{ 'auth.eyebrow' | transloco }}</p>
                  <h1 class="mt-2 text-[1.7rem] font-semibold tracking-tight text-ink">
                    {{ 'auth.mfa.challengeTitle' | transloco }}
                  </h1>
                  <p class="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                    {{ 'auth.mfa.challengeHint' | transloco }}
                  </p>

                  @if (locked()) {
                    <div class="alert alert-danger mt-5" role="alert" aria-live="assertive">
                      <app-icon name="lock" [size]="16" class="mt-0.5 shrink-0" />
                      <span>{{ 'auth.mfa.locked' | transloco }}</span>
                    </div>
                  }

                  <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
                    <div class="field">
                      <label class="field-label" for="mfa-code">
                        {{
                          (recovery() ? 'auth.mfa.recoveryCode' : 'auth.mfa.code') | transloco
                        }}
                      </label>
                      <input
                        id="mfa-code"
                        type="text"
                        formControlName="code"
                        class="input h-14 text-center text-[1.3rem] font-semibold tabular-nums"
                        [style.letter-spacing]="recovery() ? '0.12em' : '0.5em'"
                        [class.border-danger]="errorKey() !== null"
                        [attr.inputmode]="recovery() ? 'text' : 'numeric'"
                        [attr.autocomplete]="recovery() ? 'off' : 'one-time-code'"
                        [attr.maxlength]="recovery() ? 9 : 6"
                        [attr.placeholder]="recovery() ? 'XXXX-XXXX' : '000000'"
                        [attr.aria-invalid]="errorKey() !== null"
                        [attr.aria-describedby]="'mfa-code-hint'"
                        [attr.autocapitalize]="recovery() ? 'characters' : 'off'"
                        [attr.spellcheck]="false"
                        [disabled]="locked()"
                        (input)="onInput($event)"
                        (paste)="onPaste($event)"
                      />
                      <p class="field-hint" id="mfa-code-hint">
                        {{
                          (recovery() ? 'auth.mfa.recoveryHint' : 'auth.mfa.challengeHint')
                            | transloco
                        }}
                      </p>
                    </div>

                    @if (errorKey(); as error) {
                      <div class="alert alert-danger" role="alert" aria-live="polite">
                        <app-icon name="alert" [size]="16" class="mt-0.5 shrink-0" />
                        <span>{{ error | transloco }}</span>
                      </div>
                    }

                    <label
                      class="flex cursor-pointer items-center gap-2.5 text-[12.5px] font-medium text-ink-2 transition hover:text-ink"
                    >
                      <input name="useRecovery"
                        type="checkbox"
                        class="h-4 w-4 shrink-0 rounded border-line"
                        [style.accent-color]="'var(--accent)'"
                        [checked]="recovery()"
                        [disabled]="locked()"
                        (change)="toggleRecovery()" autocomplete="off" />
                      {{ 'auth.mfa.useRecovery' | transloco }}
                    </label>

                    <button
                      type="submit"
                      class="btn btn-primary h-11 w-full text-sm"
                      [disabled]="verifying() || locked() || !canSubmit()"
                    >
                      @if (verifying()) {
                        <span
                          class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                          aria-hidden="true"
                        ></span>
                        <span>{{ 'auth.mfa.verifying' | transloco }}</span>
                      } @else {
                        <span>{{ 'auth.mfa.verify' | transloco }}</span>
                        <app-icon name="arrow-right" [size]="16" />
                      }
                    </button>
                  </form>

                  <a
                    routerLink="/login"
                    class="mt-5 inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-ink-2 transition hover:text-ink"
                  >
                    <app-icon name="arrow-left" [size]="14" />
                    {{ 'auth.backToLogin' | transloco }}
                  </a>
                }
              </div>
            </div>

            <p class="mt-5 text-center text-[10.5px] text-ink-3 lg:hidden">
              {{ 'auth.copyright' | transloco: { year: year } }}
            </p>
          </div>
        </div>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MfaChallengePage {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);

  readonly year = new Date().getFullYear();
  readonly verifying = signal(false);
  readonly locked = signal(false);
  readonly recovery = signal(false);
  readonly errorKey = signal<string | null>(null);

  private readonly challenge = this.readChallenge();
  readonly challengeToken = this.challenge?.challengeToken ?? '';
  readonly expired = signal(!this.challenge || this.isPast(this.challenge.expiresAt));

  readonly form = this.fb.nonNullable.group({ code: [''] });
  private readonly codeValue = toSignal(this.form.controls.code.valueChanges, { initialValue: '' });

  readonly canSubmit = computed(() =>
    this.recovery()
      ? RECOVERY_PATTERN.test(this.codeValue())
      : TOTP_PATTERN.test(this.codeValue()),
  );

  async submit(pendingCode?: string): Promise<void> {
    if (this.verifying() || this.locked() || this.expired()) return;
    if (!this.challengeToken) return;

    const code = (pendingCode ?? this.form.controls.code.value).trim();
    const valid = this.recovery() ? RECOVERY_PATTERN.test(code) : TOTP_PATTERN.test(code);
    if (!valid) return;

    this.errorKey.set(null);
    this.verifying.set(true);
    try {
      const session = await firstValueFrom(
        this.api.post<Session>('/auth/mfa/verify', {
          challengeToken: this.challengeToken,
          code,
        }),
      );
      await this.completeSignIn(session);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.verifying.set(false);
    }
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cleaned = this.recovery()
      ? input.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9)
      : input.value.replace(/\D/g, '').slice(0, 6);

    if (cleaned !== input.value) {
      this.form.controls.code.setValue(cleaned);
    }

    // Auto-submit off the raw value: the accessor's model update may land after
    // this listener, so the control cannot be trusted to be current yet.
    if (!this.recovery() && cleaned.length === 6) {
      void this.submit(cleaned);
    }
  }

  onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const cleaned = this.recovery()
      ? text.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9)
      : text.replace(/\D/g, '').slice(0, 6);

    if (!cleaned) return;
    event.preventDefault();
    this.form.controls.code.setValue(cleaned);

    if (!this.recovery() && cleaned.length === 6) {
      void this.submit(cleaned);
    }
  }

  toggleRecovery(): void {
    this.recovery.set(!this.recovery());
    this.form.controls.code.setValue('');
    this.errorKey.set(null);
  }

  private handleError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      this.errorKey.set('common.error');
      return;
    }

    const code = this.codeOf(error);

    if (error.status === 429 || code === 'MFA_LOCKED') {
      this.locked.set(true);
      return;
    }

    if (code === 'MFA_CHALLENGE_EXPIRED') {
      this.markExpired();
      return;
    }

    if (code === 'MFA_CODE_INVALID' || error.status === 401) {
      this.errorKey.set('auth.mfa.invalidCode');
      this.form.controls.code.setValue('');
      return;
    }

    this.errorKey.set('common.error');
  }

  /** The verify endpoint returns a full session, so apply it directly. */
  private async completeSignIn(session: Session): Promise<void> {
    try {
      sessionStorage.removeItem(CHALLENGE_KEY);
    } catch {
      // Private browsing may block storage; the session still works in memory.
    }

    this.auth.completeMfa(session);
    await this.router.navigateByUrl(homeRouteFor(this.auth));
  }

  private markExpired(): void {
    try {
      sessionStorage.removeItem(CHALLENGE_KEY);
    } catch {
      // Nothing to clean up if storage is blocked.
    }
    this.form.controls.code.setValue('');
    this.errorKey.set(null);
    this.expired.set(true);
  }

  private codeOf(error: HttpErrorResponse): string | null {
    const body = error.error as { code?: string } | null;
    return body?.code ?? null;
  }

  private readChallenge(): PendingChallenge | null {
    try {
      const raw = sessionStorage.getItem(CHALLENGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PendingChallenge> | null;
      if (!parsed?.challengeToken || !parsed.expiresAt) return null;
      return { challengeToken: parsed.challengeToken, expiresAt: parsed.expiresAt };
    } catch {
      return null;
    }
  }

  private isPast(expiresAt: string): boolean {
    const at = Date.parse(expiresAt);
    return !Number.isFinite(at) || at <= Date.now();
  }
}
