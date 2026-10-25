import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { LanguageService } from '../../core/language.service';
import { ThemeService } from '../../core/theme.service';
import { IconComponent } from '../../shared/ui/icon';

/**
 * Password reset, step one.
 *
 * Anti-enumeration: the response is identical for known and unknown addresses,
 * so the confirmation must never repeat the submitted address, must not claim
 * an email was sent to it, and must not change shape based on the result.
 */
@Component({
  selector: 'app-forgot-password',
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
              <div class="flex min-h-[19rem] flex-col justify-center">
                @if (sent()) {
                  <div role="status" aria-live="polite" class="text-center">
                    <span
                      class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong"
                    >
                      <app-icon name="mail" [size]="22" />
                    </span>
                    <h1 class="mt-4 text-[1.4rem] font-semibold tracking-tight text-ink">
                      {{ 'auth.forgot.sent' | transloco }}
                    </h1>
                    <p class="mt-2 text-[13px] leading-relaxed text-ink-2">
                      {{ 'auth.forgot.sentHint' | transloco }}
                    </p>
                    <a routerLink="/login" class="btn btn-secondary mt-6 h-11 w-full text-sm">
                      <app-icon name="arrow-left" [size]="16" />
                      {{ 'auth.forgot.backToLogin' | transloco }}
                    </a>
                  </div>
                } @else {
                  <p class="eyebrow">{{ 'auth.eyebrow' | transloco }}</p>
                  <h1 class="mt-2 text-[1.7rem] font-semibold tracking-tight text-ink">
                    {{ 'auth.forgot.title' | transloco }}
                  </h1>
                  <p class="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                    {{ 'auth.forgot.subtitle' | transloco }}
                  </p>

                  <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
                    <div class="field">
                      <label class="field-label" for="forgot-email">{{
                        'auth.forgot.email' | transloco
                      }}</label>
                      <input
                        id="forgot-email"
                        type="email"
                        formControlName="email"
                        class="input"
                        [class.border-danger]="emailControl.touched && emailControl.invalid"
                        [placeholder]="'auth.emailPlaceholder' | transloco"
                        autocomplete="email"
                        inputmode="email"
                        [attr.aria-invalid]="emailControl.touched && emailControl.invalid"
                        [attr.aria-describedby]="
                          emailControl.touched && emailControl.invalid ? 'forgot-email-error' : null
                        "
                      />
                      @if (emailControl.touched && emailControl.hasError('required')) {
                        <p class="field-error" id="forgot-email-error">
                          {{ 'auth.emailRequired' | transloco }}
                        </p>
                      } @else if (emailControl.touched && emailControl.hasError('email')) {
                        <p class="field-error" id="forgot-email-error">
                          {{ 'common.invalidEmail' | transloco }}
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
                      [disabled]="loading()"
                    >
                      @if (loading()) {
                        <span
                          class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                          aria-hidden="true"
                        ></span>
                        <span>{{ 'auth.forgot.sending' | transloco }}</span>
                      } @else {
                        <span>{{ 'auth.forgot.submit' | transloco }}</span>
                        <app-icon name="arrow-right" [size]="16" />
                      }
                    </button>
                  </form>

                  <a
                    routerLink="/login"
                    class="mt-5 inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-ink-2 transition hover:text-ink"
                  >
                    <app-icon name="arrow-left" [size]="14" />
                    {{ 'auth.forgot.backToLogin' | transloco }}
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
export class ForgotPasswordPage {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);

  readonly year = new Date().getFullYear();
  readonly loading = signal(false);
  readonly sent = signal(false);
  readonly errorKey = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  readonly emailControl = this.form.controls.email;

  async submit(): Promise<void> {
    if (this.loading() || this.sent()) return;
    this.errorKey.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const email = this.emailControl.value.trim();
    this.loading.set(true);
    try {
      await firstValueFrom(
        this.api.post<{ success: boolean }>('/auth/password-reset/request', { email }),
      );
      // Drop the address from memory: the confirmation never refers to it.
      this.form.reset({ email: '' });
      this.sent.set(true);
    } catch (error) {
      this.errorKey.set(
        error instanceof HttpErrorResponse && error.status === 429
          ? 'errors.tooMany'
          : 'common.error',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
