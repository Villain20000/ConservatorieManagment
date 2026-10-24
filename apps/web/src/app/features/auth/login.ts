import { ChangeDetectionStrategy, Component, inject, isDevMode, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth.service';
import { homeRouteFor } from '../../core/guards';
import { LanguageService } from '../../core/language.service';
import { ThemeService } from '../../core/theme.service';
import type { Membership } from '../../core/models';
import { IconComponent } from '../../shared/ui/icon';
import { StatusBadgeComponent } from '../../shared/ui/status-badge';

const DEMO_PASSWORD = 'MusicOS2026!';

interface DemoAccount {
  labelKey: string;
  email: string;
  tenant?: string;
  tenantKey?: string;
}

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, TranslocoPipe, IconComponent, StatusBadgeComponent],
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
              @if (mode() === 'login') {
                <p class="eyebrow">{{ 'auth.eyebrow' | transloco }}</p>
                <h1 class="mt-2 text-[1.7rem] font-semibold tracking-tight text-ink">
                  {{ 'auth.welcome' | transloco }}
                </h1>
                <p class="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                  {{ 'auth.subtitle' | transloco }}
                </p>

                <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
                  <div class="field">
                    <label class="field-label" for="login-email">{{
                      'auth.email' | transloco
                    }}</label>
                    <input
                      id="login-email"
                      type="email"
                      formControlName="email"
                      class="input"
                      [class.border-danger]="emailControl.touched && emailControl.invalid"
                      [placeholder]="'auth.emailPlaceholder' | transloco"
                      autocomplete="email"
                      inputmode="email"
                      [attr.aria-invalid]="emailControl.touched && emailControl.invalid"
                    />
                    @if (emailControl.touched && emailControl.hasError('required')) {
                      <p class="field-error">{{ 'auth.emailRequired' | transloco }}</p>
                    } @else if (emailControl.touched && emailControl.hasError('email')) {
                      <p class="field-error">{{ 'common.invalidEmail' | transloco }}</p>
                    }
                  </div>

                  <div class="field">
                    <label class="field-label" for="login-password">{{
                      'auth.password' | transloco
                    }}</label>
                    <div class="relative">
                      <input
                        id="login-password"
                        [type]="showPassword() ? 'text' : 'password'"
                        formControlName="password"
                        class="input pr-10"
                        [class.border-danger]="passwordControl.touched && passwordControl.invalid"
                        [placeholder]="'auth.passwordPlaceholder' | transloco"
                        autocomplete="current-password"
                        [attr.aria-invalid]="passwordControl.touched && passwordControl.invalid"
                      />
                      <button
                        type="button"
                        class="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-3 hover:text-ink"
                        (click)="showPassword.set(!showPassword())"
                        [attr.aria-label]="
                          (showPassword() ? 'auth.hidePassword' : 'auth.showPassword') | transloco
                        "
                        [attr.aria-pressed]="showPassword()"
                      >
                        <app-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="16" />
                      </button>
                    </div>
                    @if (passwordControl.touched && passwordControl.hasError('required')) {
                      <p class="field-error">{{ 'auth.passwordRequired' | transloco }}</p>
                    }
                  </div>

                  @if (errorKey(); as error) {
                    <div class="alert alert-danger" role="alert" aria-live="polite">
                      <app-icon name="alert" [size]="16" class="mt-0.5" />
                      <span>{{ error | transloco }}</span>
                    </div>
                  }

                  <button
                    type="submit"
                    class="btn btn-primary h-11 w-full text-sm"
                    [disabled]="loading()"
                  >
                    @if (loading()) {
                      <span
                        class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                        aria-hidden="true"
                      ></span>
                      <span>{{ 'auth.signingIn' | transloco }}</span>
                    } @else {
                      <span>{{ 'auth.signIn' | transloco }}</span>
                      <app-icon name="arrow-right" [size]="16" />
                    }
                  </button>
                </form>
              } @else {
                <p class="eyebrow">{{ 'auth.welcome' | transloco }}</p>
                <h1 class="mt-2 text-[1.7rem] font-semibold tracking-tight text-ink">
                  {{ 'auth.chooseTenant' | transloco }}
                </h1>
                <p class="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                  {{ 'auth.chooseTenantHint' | transloco }}
                </p>

                @if (errorKey(); as error) {
                  <div class="alert alert-danger mt-4" role="alert" aria-live="polite">
                    <app-icon name="alert" [size]="16" class="mt-0.5" />
                    <span>{{ error | transloco }}</span>
                  </div>
                }

                <div class="mt-5 space-y-2">
                  @for (membership of auth.memberships(); track membership.id) {
                    <button
                      type="button"
                      class="group flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 p-3.5 text-left transition hover:border-accent/60 hover:bg-accent-soft/40 disabled:pointer-events-none disabled:opacity-60"
                      [disabled]="selectingTenantId() !== null"
                      (click)="selectTenant(membership)"
                    >
                      <span
                        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong"
                      >
                        <app-icon name="building" [size]="18" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-[13px] font-semibold text-ink">
                          {{ membership.tenant.name }}
                        </span>
                        <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <app-status-badge [status]="membership.tenant.status" />
                          <span class="text-[10px] font-medium text-ink-3/80">
                            {{ membership.tenant.slug }}
                          </span>
                          <span class="text-[10.5px] font-medium text-ink-3">
                            {{ 'roles.' + membership.role | transloco }}
                          </span>
                        </span>
                      </span>
                      @if (selectingTenantId() === membership.tenantId) {
                        <span
                          class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent"
                          aria-hidden="true"
                        ></span>
                      } @else {
                        <app-icon
                          name="arrow-right"
                          [size]="16"
                          class="shrink-0 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-accent-strong"
                        />
                      }
                    </button>
                  } @empty {
                    <p class="py-8 text-center text-[12.5px] text-ink-3">
                      {{ 'common.noResults' | transloco }}
                    </p>
                  }
                </div>

                <button
                  type="button"
                  class="mt-5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-2 transition hover:text-ink disabled:pointer-events-none disabled:opacity-50"
                  [disabled]="selectingTenantId() !== null"
                  (click)="backToLogin()"
                >
                  <app-icon name="arrow-left" [size]="14" />
                  {{ 'auth.backToLogin' | transloco }}
                </button>
              }
            </div>

            @if (devMode && mode() === 'login') {
              <div
                class="mt-4 rounded-2xl border border-dashed border-line-strong bg-surface/70 p-4 shadow-card"
              >
                <div class="flex items-center justify-between gap-2">
                  <h2 class="text-[12.5px] font-semibold text-ink">
                    {{ 'auth.demoTitle' | transloco }}
                  </h2>
                  <span class="badge badge-neutral">{{ 'common.demo' | transloco }}</span>
                </div>
                <p class="mt-1 text-[11px] leading-relaxed text-ink-3">
                  {{ 'auth.demoHint' | transloco }}
                </p>
                <div class="-mx-2 mt-2 max-h-64 divide-y divide-line/70 overflow-y-auto">
                  @for (account of demoAccounts; track account.email) {
                    <button
                      type="button"
                      class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-surface-2"
                      (click)="fillDemo(account)"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-[12px] font-semibold text-ink">
                          {{ account.labelKey | transloco }}
                        </span>
                        <span class="block truncate text-[10.5px] text-ink-3">{{
                          account.email
                        }}</span>
                      </span>
                      @if (account.tenantKey; as key) {
                        <span class="shrink-0 text-[10px] font-medium text-ink-3">{{
                          key | transloco
                        }}</span>
                      } @else {
                        <span class="shrink-0 text-[10px] font-medium text-ink-3">{{
                          account.tenant
                        }}</span>
                      }
                    </button>
                  }
                </div>
                <p class="mt-2 border-t border-line/70 pt-2 text-[10px] text-ink-3">
                  {{ 'auth.demoNote' | transloco }}
                </p>
              </div>
            }

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
export class LoginPage {
  readonly auth = inject(AuthService);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly year = new Date().getFullYear();
  readonly devMode = isDevMode();
  readonly mode = signal<'login' | 'tenant'>('login');
  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly selectingTenantId = signal<string | null>(null);
  readonly errorKey = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  readonly emailControl = this.form.controls.email;
  readonly passwordControl = this.form.controls.password;

  readonly returnUrl = this.readReturnUrl();

  readonly demoAccounts: readonly DemoAccount[] = [
    { labelKey: 'demo.superadmin', email: 'superadmin@musicos.test', tenantKey: 'platform.title' },
    { labelKey: 'demo.director', email: 'director@armonia.test', tenant: 'Armonia' },
    { labelKey: 'demo.administrator', email: 'admin@armonia.test', tenant: 'Armonia' },
    { labelKey: 'demo.teacher', email: 'teacher@armonia.test', tenant: 'Armonia' },
    { labelKey: 'demo.student', email: 'student@armonia.test', tenant: 'Armonia' },
    { labelKey: 'demo.directorB', email: 'director@melodia.test', tenant: 'Melodia' },
    { labelKey: 'demo.multi', email: 'multi@musicos.test', tenant: 'Armonia · Melodia' },
  ];

  async submit(): Promise<void> {
    if (this.loading()) return;
    this.errorKey.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.loading.set(true);
    try {
      const session = await this.auth.login(email.trim(), password);
      if (
        session.requiresTenantSelection ||
        (!session.activeTenant && session.memberships.length > 0)
      ) {
        this.mode.set('tenant');
        return;
      }
      await this.navigateAfterAuth();
    } catch {
      this.errorKey.set('auth.invalid');
    } finally {
      this.loading.set(false);
    }
  }

  async selectTenant(membership: Membership): Promise<void> {
    if (this.selectingTenantId()) return;
    this.errorKey.set(null);
    this.selectingTenantId.set(membership.tenantId);
    try {
      await this.auth.selectTenant(membership.tenantId);
      await this.navigateAfterAuth();
    } catch {
      this.errorKey.set('common.error');
    } finally {
      this.selectingTenantId.set(null);
    }
  }

  backToLogin(): void {
    this.mode.set('login');
    this.errorKey.set(null);
    this.selectingTenantId.set(null);
    this.passwordControl.reset();
  }

  fillDemo(account: DemoAccount): void {
    this.errorKey.set(null);
    this.form.patchValue({ email: account.email, password: DEMO_PASSWORD });
    this.emailControl.markAsTouched();
    this.passwordControl.markAsTouched();
  }

  private async navigateAfterAuth(): Promise<void> {
    await this.router.navigateByUrl(this.returnUrl ?? homeRouteFor(this.auth));
  }

  private readReturnUrl(): string | null {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('//') ? url : null;
  }
}
