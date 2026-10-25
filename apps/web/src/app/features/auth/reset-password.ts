import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { LanguageService } from '../../core/language.service';
import { ThemeService } from '../../core/theme.service';
import { PASSWORD_MIN_LENGTH, passwordStrength, passwordsMatch } from '../../core/validators';
import { IconComponent } from '../../shared/ui/icon';

type ResetState = 'checking' | 'invalid' | 'valid' | 'done';

/**
 * Password reset, step two. The token arrives in the query string and is
 * validated before the form is shown, so a dead link never looks usable.
 *
 * The API revokes every session on a successful reset, so there is no
 * auto-login: the user is sent back to the sign-in screen.
 */
@Component({
  selector: 'app-reset-password',
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
              <div class="flex min-h-[26rem] flex-col justify-center">
                @switch (state()) {
                  @case ('checking') {
                    <div aria-busy="true">
                      <p class="sr-only">{{ 'common.loading' | transloco }}</p>
                      <div class="skeleton h-3 w-24"></div>
                      <div class="skeleton mt-3 h-7 w-2/3"></div>
                      <div class="skeleton mt-3 h-3 w-full"></div>
                      <div class="skeleton mt-1.5 h-3 w-4/5"></div>
                      <div class="skeleton mt-6 h-10 w-full"></div>
                      <div class="skeleton mt-4 h-10 w-full"></div>
                      <div class="skeleton mt-4 h-10 w-full"></div>
                      <div class="skeleton mt-5 h-11 w-full"></div>
                    </div>
                  }

                  @case ('invalid') {
                    <div role="alert">
                      <span
                        class="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger"
                      >
                        <app-icon name="alert" [size]="22" />
                      </span>
                      <h1 class="mt-4 text-[1.4rem] font-semibold tracking-tight text-ink">
                        {{ 'auth.reset.invalid' | transloco }}
                      </h1>
                      <p class="mt-2 text-[13px] leading-relaxed text-ink-2">
                        {{ 'auth.reset.invalidHint' | transloco }}
                      </p>
                      <a
                        routerLink="/forgot-password"
                        class="btn btn-primary mt-6 h-11 w-full text-sm"
                      >
                        <app-icon name="refresh" [size]="16" />
                        {{ 'auth.reset.requestNew' | transloco }}
                      </a>
                      <a
                        routerLink="/login"
                        class="mt-4 inline-flex w-full items-center justify-center gap-1.5 text-[12px] font-semibold text-ink-2 transition hover:text-ink"
                      >
                        <app-icon name="arrow-left" [size]="14" />
                        {{ 'auth.backToLogin' | transloco }}
                      </a>
                    </div>
                  }

                  @case ('done') {
                    <div role="status" aria-live="polite" class="text-center">
                      <span
                        class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-success-soft text-success"
                      >
                        <app-icon name="check-circle" [size]="22" />
                      </span>
                      <h1 class="mt-4 text-[1.4rem] font-semibold tracking-tight text-ink">
                        {{ 'auth.reset.done' | transloco }}
                      </h1>
                      <p class="mt-2 text-[13px] leading-relaxed text-ink-2">
                        {{ 'auth.reset.doneHint' | transloco }}
                      </p>
                      <a routerLink="/login" class="btn btn-primary mt-6 h-11 w-full text-sm">
                        <app-icon name="arrow-right" [size]="16" />
                        {{ 'auth.backToLogin' | transloco }}
                      </a>
                    </div>
                  }

                  @default {
                    <p class="eyebrow">{{ 'auth.eyebrow' | transloco }}</p>
                    <h1 class="mt-2 text-[1.7rem] font-semibold tracking-tight text-ink">
                      {{ 'auth.reset.title' | transloco }}
                    </h1>
                    <p class="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                      {{ 'auth.reset.subtitle' | transloco }}
                    </p>

                    <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
                      <div class="field">
                        <label class="field-label" for="reset-password">{{
                          'auth.reset.password' | transloco
                        }}</label>
                        <div class="relative">
                          <input
                            id="reset-password"
                            [type]="showPassword() ? 'text' : 'password'"
                            formControlName="newPassword"
                            class="input pr-10"
                            [class.border-danger]="
                              passwordControl.touched && passwordControl.invalid
                            "
                            [placeholder]="'auth.passwordPlaceholder' | transloco"
                            autocomplete="new-password"
                            [attr.aria-invalid]="passwordControl.touched && passwordControl.invalid"
                            [attr.aria-describedby]="
                              passwordControl.touched && passwordControl.invalid
                                ? 'reset-password-hint reset-password-error'
                                : 'reset-password-hint'
                            "
                          />
                          <button
                            type="button"
                            class="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-3 hover:text-ink"
                            (click)="showPassword.set(!showPassword())"
                            [attr.aria-label]="
                              (showPassword() ? 'auth.hidePassword' : 'auth.showPassword')
                                | transloco
                            "
                            [attr.aria-pressed]="showPassword()"
                          >
                            <app-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="16" />
                          </button>
                        </div>

                        <div class="mt-1 flex items-center gap-1.5" aria-hidden="true">
                          <span
                            class="h-1 flex-1 rounded-full transition-colors"
                            [class.bg-line]="strengthLevel() < 1"
                            [class.bg-danger]="strengthLevel() >= 1 && strength() === 'weak'"
                            [class.bg-warning]="strengthLevel() >= 1 && strength() === 'fair'"
                            [class.bg-success]="strengthLevel() >= 1 && strength() === 'strong'"
                          ></span>
                          <span
                            class="h-1 flex-1 rounded-full transition-colors"
                            [class.bg-line]="strengthLevel() < 2"
                            [class.bg-warning]="strengthLevel() >= 2 && strength() === 'fair'"
                            [class.bg-success]="strengthLevel() >= 2 && strength() === 'strong'"
                          ></span>
                          <span
                            class="h-1 flex-1 rounded-full transition-colors"
                            [class.bg-line]="strengthLevel() < 3"
                            [class.bg-success]="strengthLevel() >= 3"
                          ></span>
                        </div>

                        <p class="field-hint" id="reset-password-hint" aria-live="polite">
                          {{ strengthKey() | transloco }}
                        </p>

                        @if (passwordControl.touched && passwordControl.hasError('required')) {
                          <p class="field-error" id="reset-password-error">
                            {{ 'common.required' | transloco }}
                          </p>
                        } @else if (
                          passwordControl.touched && passwordControl.hasError('minlength')
                        ) {
                          <p class="field-error" id="reset-password-error">
                            {{ 'auth.reset.tooShort' | transloco: { min: minLength } }}
                          </p>
                        }
                      </div>

                      <div class="field">
                        <label class="field-label" for="reset-confirm">{{
                          'auth.reset.confirm' | transloco
                        }}</label>
                        <input
                          id="reset-confirm"
                          [type]="showPassword() ? 'text' : 'password'"
                          formControlName="confirmPassword"
                          class="input"
                          [class.border-danger]="
                            confirmControl.touched && (confirmControl.invalid || mismatch())
                          "
                          [placeholder]="'auth.passwordPlaceholder' | transloco"
                          autocomplete="new-password"
                          [attr.aria-invalid]="
                            confirmControl.touched && (confirmControl.invalid || mismatch())
                          "
                          [attr.aria-describedby]="
                            confirmControl.touched && mismatch() ? 'reset-confirm-error' : null
                          "
                        />
                        @if (confirmControl.touched && confirmControl.hasError('required')) {
                          <p class="field-error" id="reset-confirm-error">
                            {{ 'common.required' | transloco }}
                          </p>
                        } @else if (confirmControl.touched && mismatch()) {
                          <p class="field-error" id="reset-confirm-error">
                            {{ 'auth.reset.mismatch' | transloco }}
                          </p>
                        }
                      </div>

                      @if (errorKey(); as error) {
                        <div class="alert alert-danger" role="alert" aria-live="polite">
                          <app-icon name="alert" [size]="16" class="mt-0.5 shrink-0" />
                          <span>{{ error | transloco }}</span>
                        </div>
                      }

                      <button
                        type="submit"
                        class="btn btn-primary h-11 w-full text-sm"
                        [disabled]="saving()"
                      >
                        @if (saving()) {
                          <span
                            class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                            aria-hidden="true"
                          ></span>
                          <span>{{ 'auth.reset.saving' | transloco }}</span>
                        } @else {
                          <span>{{ 'auth.reset.submit' | transloco }}</span>
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
export class ResetPasswordPage {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);

  readonly year = new Date().getFullYear();
  readonly minLength = PASSWORD_MIN_LENGTH;
  readonly state = signal<ResetState>('checking');
  readonly saving = signal(false);
  readonly showPassword = signal(false);
  readonly errorKey = signal<string | null>(null);

  readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  readonly form = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch('newPassword', 'confirmPassword') },
  );
  readonly passwordControl = this.form.controls.newPassword;
  readonly confirmControl = this.form.controls.confirmPassword;

  private readonly passwordValue = toSignal(this.passwordControl.valueChanges, {
    initialValue: '',
  });

  readonly strength = computed(() => passwordStrength(this.passwordValue()));
  readonly strengthLevel = computed(() => {
    if (!this.passwordValue()) return 0;
    const value = this.strength();
    return value === 'strong' ? 3 : value === 'fair' ? 2 : 1;
  });
  readonly strengthKey = computed(() => {
    switch (this.strength()) {
      case 'strong':
        return 'auth.reset.strengthStrong';
      case 'fair':
        return 'auth.reset.strengthFair';
      default:
        return 'auth.reset.strengthWeak';
    }
  });

  /** Read straight off the group: form state is not a signal, so no `computed`. */
  mismatch(): boolean {
    return this.form.hasError('mismatch');
  }

  constructor() {
    void this.checkToken();
  }

  async submit(): Promise<void> {
    if (this.saving() || this.state() !== 'valid') return;
    this.errorKey.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const newPassword = this.passwordControl.value;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.api.post<{ success: boolean; message: string }>('/auth/password-reset/confirm', {
          token: this.token,
          newPassword,
        }),
      );
      this.form.reset();
      this.state.set('done');
    } catch (error) {
      if (error instanceof HttpErrorResponse && this.codeOf(error) === 'INVALID_OR_EXPIRED_TOKEN') {
        this.state.set('invalid');
        return;
      }
      this.errorKey.set(
        error instanceof HttpErrorResponse && error.status === 429
          ? 'errors.tooMany'
          : 'common.error',
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async checkToken(): Promise<void> {
    if (!this.token) {
      this.state.set('invalid');
      return;
    }

    try {
      const result = await firstValueFrom(
        this.api.get<{ valid: boolean }>('/auth/password-reset/validate', { token: this.token }),
      );
      this.state.set(result.valid ? 'valid' : 'invalid');
    } catch {
      // A link we cannot verify is treated as unusable; the panel offers a new one.
      this.state.set('invalid');
    }
  }

  private codeOf(error: HttpErrorResponse): string | null {
    const body = error.error as { code?: string } | null;
    return body?.code ?? null;
  }
}
