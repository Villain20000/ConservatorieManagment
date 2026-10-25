import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { FormatService } from '../../core/format.service';
import { LanguageService } from '../../core/language.service';
import type { TenantInfo } from '../../core/models';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { DeletedItemsComponent } from './deleted-items';
import { SchoolCalendarComponent } from './school-calendar';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

type TabId = 'profile' | 'security' | 'preferences' | 'tenant' | 'calendar' | 'deleted';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const newPassword = control.get('newPassword')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return newPassword === confirmPassword ? null : { mismatch: true };
}

@Component({
  selector: 'app-settings',
  imports: [SHARED_IMPORTS, ReactiveFormsModule, DeletedItemsComponent, SchoolCalendarComponent],
  template: `
    <div class="page">
      <app-page-header title="settings.title" subtitle="settings.subtitle" eyebrow="nav.settings" />

      <div class="mb-5 overflow-x-auto">
        <nav class="inline-flex min-w-full gap-1 rounded-xl border border-line bg-surface p-1 sm:min-w-0" role="tablist">
          @for (item of tabs; track item.id) {
            <button
              type="button"
              role="tab"
              class="flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
              [class.bg-accent-soft]="tab() === item.id"
              [class.text-accent-strong]="tab() === item.id"
              [attr.aria-selected]="tab() === item.id"
              (click)="selectTab(item.id)"
            >
              <app-icon [name]="item.icon" [size]="15" />
              {{ item.label | transloco }}
            </button>
          }
        </nav>
      </div>

      @switch (tab()) {
        @case ('profile') {
          <section class="card">
            <div class="card-head">
              <div>
                <h2 class="text-[15px] font-semibold">{{ 'settings.profile.title' | transloco }}</h2>
                <p class="mt-0.5 text-[12px] text-ink-3">{{ 'common.readOnly' | transloco }}</p>
              </div>
              @if (auth.isPlatformAdmin()) {
                <span class="badge badge-accent">
                  <app-icon name="crown" [size]="12" />
                  {{ 'settings.profile.platformAdmin' | transloco }}
                </span>
              }
            </div>
            <div class="card-pad">
              @if (auth.user(); as user) {
                <dl class="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
                  <div class="bg-surface p-4">
                    <dt class="field-label">{{ 'settings.profile.firstName' | transloco }}</dt>
                    <dd class="mt-1 text-sm font-medium">{{ user.firstName }}</dd>
                  </div>
                  <div class="bg-surface p-4">
                    <dt class="field-label">{{ 'settings.profile.lastName' | transloco }}</dt>
                    <dd class="mt-1 text-sm font-medium">{{ user.lastName }}</dd>
                  </div>
                  <div class="bg-surface p-4">
                    <dt class="field-label">{{ 'settings.profile.email' | transloco }}</dt>
                    <dd class="mt-1 text-sm font-medium">{{ user.email }}</dd>
                    <p class="mt-1 text-[11.5px] leading-snug text-ink-3">
                      {{ 'settings.profile.emailHint' | transloco }}
                    </p>
                  </div>
                  <div class="bg-surface p-4">
                    <dt class="field-label">{{ 'settings.profile.role' | transloco }}</dt>
                    <dd class="mt-1 text-sm font-medium">
                      @if (auth.role(); as role) {
                        <span class="badge badge-accent">{{ ('roles.' + role) | transloco }}</span>
                      } @else {
                        {{ 'common.noneFound' | transloco }}
                      }
                    </dd>
                  </div>
                  <div class="bg-surface p-4">
                    <dt class="field-label">{{ 'settings.profile.tenant' | transloco }}</dt>
                    <dd class="mt-1 text-sm font-medium">
                      {{ auth.activeTenant()?.tenant?.name ?? ('common.none' | transloco) }}
                    </dd>
                  </div>
                  <div class="bg-surface p-4">
                    <dt class="field-label">{{ 'common.status' | transloco }}</dt>
                    <dd class="mt-1 text-sm font-medium">
                      @if (auth.isPlatformAdmin()) {
                        <span class="inline-flex items-center gap-1.5 text-accent-strong">
                          <app-icon name="crown" [size]="14" />
                          {{ 'settings.profile.platformAdmin' | transloco }}
                        </span>
                      } @else {
                        {{ 'common.active' | transloco }}
                      }
                    </dd>
                  </div>
                </dl>
                <div class="alert alert-info mt-4">
                  <app-icon name="info" [size]="16" class="mt-0.5 shrink-0" />
                  <p>{{ 'settings.profile.emailHint' | transloco }}</p>
                </div>
              }
            </div>
          </section>
        }

        @case ('security') {
          <section class="card max-w-2xl">
            <div class="card-head">
              <div>
                <h2 class="text-[15px] font-semibold">{{ 'settings.security.title' | transloco }}</h2>
                <p class="mt-0.5 text-[12px] text-ink-3">{{ 'settings.security.sessionsNote' | transloco }}</p>
              </div>
              <span class="icon-box h-9 w-9"><app-icon name="lock" [size]="16" /></span>
            </div>
            <div class="card-pad">
              <form [formGroup]="passwordForm" class="space-y-4" (ngSubmit)="submitPassword()">
                <div class="field">
                  <label class="field-label" for="current-password">{{ 'settings.security.current' | transloco }}</label>
                  <input
                    id="current-password"
                    type="password"
                    class="input"
                    formControlName="currentPassword"
                    autocomplete="current-password"
                  />
                  @if (passwordForm.controls.currentPassword.touched && passwordForm.controls.currentPassword.hasError('required')) {
                    <p class="field-error">{{ 'common.required' | transloco }}</p>
                  }
                </div>

                <div class="field">
                  <label class="field-label" for="new-password">{{ 'settings.security.new' | transloco }}</label>
                  <input
                    id="new-password"
                    type="password"
                    class="input"
                    formControlName="newPassword"
                    autocomplete="new-password"
                  />
                  @if (passwordForm.controls.newPassword.touched) {
                    @if (passwordForm.controls.newPassword.hasError('required')) {
                      <p class="field-error">{{ 'common.required' | transloco }}</p>
                    } @else if (passwordForm.controls.newPassword.hasError('minlength')) {
                      <p class="field-error">{{ 'settings.security.validate' | transloco }}</p>
                    }
                  }
                </div>

                <div class="field">
                  <label class="field-label" for="confirm-password">{{ 'settings.security.confirm' | transloco }}</label>
                  <input
                    id="confirm-password"
                    type="password"
                    class="input"
                    formControlName="confirmPassword"
                    autocomplete="new-password"
                  />
                  @if (passwordForm.controls.confirmPassword.touched) {
                    @if (passwordForm.controls.confirmPassword.hasError('required')) {
                      <p class="field-error">{{ 'common.required' | transloco }}</p>
                    } @else if (passwordForm.hasError('mismatch')) {
                      <p class="field-error">{{ 'settings.security.mismatch' | transloco }}</p>
                    }
                  }
                </div>

                @if (passwordError()) {
                  <div class="alert alert-danger">
                    <app-icon name="alert" [size]="16" class="mt-0.5 shrink-0" />
                    <p>{{ 'settings.security.error' | transloco }}</p>
                  </div>
                }

                <div class="flex justify-end">
                  <button type="submit" class="btn btn-primary" [disabled]="savingPassword() || passwordForm.invalid">
                    <app-icon name="lock" [size]="15" />
                    {{ (savingPassword() ? 'common.saving' : 'settings.security.change') | transloco }}
                  </button>
                </div>
              </form>

              <div class="alert alert-warning mt-4">
                <app-icon name="info" [size]="16" class="mt-0.5 shrink-0" />
                <p>{{ 'settings.security.sessionsNote' | transloco }}</p>
              </div>
            </div>
          </section>
        }

        @case ('preferences') {
          <div class="grid gap-4 lg:grid-cols-2">
            <section class="card">
              <div class="card-head">
                <div>
                  <h2 class="text-[15px] font-semibold">{{ 'settings.preferences.language' | transloco }}</h2>
                  <p class="mt-0.5 text-[12px] text-ink-3">{{ 'settings.preferences.languageHint' | transloco }}</p>
                </div>
                <span class="icon-box h-9 w-9"><app-icon name="globe" [size]="16" /></span>
              </div>
              <div class="card-pad">
                <div class="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    class="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-semibold transition-colors"
                    [class.border-accent]="language.current() === 'el'"
                    [class.bg-accent-soft]="language.current() === 'el'"
                    [class.text-accent-strong]="language.current() === 'el'"
                    [class.border-line]="language.current() !== 'el'"
                    [class.bg-surface]="language.current() !== 'el'"
                    [class.text-ink-2]="language.current() !== 'el'"
                    (click)="language.set('el')"
                  >
                    <app-icon name="globe" [size]="15" />
                    {{ 'settings.preferences.greek' | transloco }}
                  </button>
                  <button
                    type="button"
                    class="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-semibold transition-colors"
                    [class.border-accent]="language.current() === 'en'"
                    [class.bg-accent-soft]="language.current() === 'en'"
                    [class.text-accent-strong]="language.current() === 'en'"
                    [class.border-line]="language.current() !== 'en'"
                    [class.bg-surface]="language.current() !== 'en'"
                    [class.text-ink-2]="language.current() !== 'en'"
                    (click)="language.set('en')"
                  >
                    <app-icon name="globe" [size]="15" />
                    {{ 'settings.preferences.english' | transloco }}
                  </button>
                </div>
              </div>
            </section>

            <section class="card">
              <div class="card-head">
                <div>
                  <h2 class="text-[15px] font-semibold">{{ 'settings.preferences.theme' | transloco }}</h2>
                  <p class="mt-0.5 text-[12px] text-ink-3">{{ 'settings.preferences.themeHint' | transloco }}</p>
                </div>
                <span class="icon-box h-9 w-9"><app-icon name="sun" [size]="16" /></span>
              </div>
              <div class="card-pad">
                <div class="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    class="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-semibold transition-colors"
                    [class.border-accent]="theme.theme() === 'light'"
                    [class.bg-accent-soft]="theme.theme() === 'light'"
                    [class.text-accent-strong]="theme.theme() === 'light'"
                    [class.border-line]="theme.theme() !== 'light'"
                    [class.bg-surface]="theme.theme() !== 'light'"
                    [class.text-ink-2]="theme.theme() !== 'light'"
                    (click)="theme.set('light')"
                  >
                    <app-icon name="sun" [size]="15" />
                    {{ 'settings.preferences.light' | transloco }}
                  </button>
                  <button
                    type="button"
                    class="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-semibold transition-colors"
                    [class.border-accent]="theme.theme() === 'dark'"
                    [class.bg-accent-soft]="theme.theme() === 'dark'"
                    [class.text-accent-strong]="theme.theme() === 'dark'"
                    [class.border-line]="theme.theme() !== 'dark'"
                    [class.bg-surface]="theme.theme() !== 'dark'"
                    [class.text-ink-2]="theme.theme() !== 'dark'"
                    (click)="theme.set('dark')"
                  >
                    <app-icon name="moon" [size]="15" />
                    {{ 'settings.preferences.dark' | transloco }}
                  </button>
                </div>
              </div>
            </section>
          </div>
        }

        @case ('tenant') {
          @if (loadingTenant()) {
            <div class="skeleton h-72 rounded-2xl"></div>
          } @else if (tenant(); as info) {
            <div class="grid gap-4 xl:grid-cols-3">
              <section class="card xl:col-span-2">
                <div class="card-head">
                  <div>
                    <h2 class="text-[15px] font-semibold">{{ 'settings.tenant.title' | transloco }}</h2>
                    <p class="mt-0.5 text-[12px] text-ink-3">{{ 'settings.tenant.readOnlyHint' | transloco }}</p>
                  </div>
                  <span class="badge badge-neutral">{{ info.slug }}</span>
                </div>
                <div class="card-pad">
                  <dl class="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
                    <div class="bg-surface p-4">
                      <dt class="field-label">{{ 'settings.tenant.name' | transloco }}</dt>
                      <dd class="mt-1 text-sm font-medium">{{ info.name }}</dd>
                    </div>
                    <div class="bg-surface p-4">
                      <dt class="field-label">{{ 'settings.tenant.legalName' | transloco }}</dt>
                      <dd class="mt-1 text-sm font-medium">{{ info.legalName || ('common.noneFound' | transloco) }}</dd>
                    </div>
                    <div class="bg-surface p-4">
                      <dt class="field-label">{{ 'settings.tenant.taxId' | transloco }}</dt>
                      <dd class="mt-1 text-sm font-medium">{{ info.taxId || ('common.noneFound' | transloco) }}</dd>
                    </div>
                    <div class="bg-surface p-4">
                      <dt class="field-label">{{ 'settings.tenant.timezone' | transloco }}</dt>
                      <dd class="mt-1 text-sm font-medium">{{ info.timezone }}</dd>
                    </div>
                    <div class="bg-surface p-4">
                      <dt class="field-label">{{ 'settings.tenant.plan' | transloco }}</dt>
                      <dd class="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span>{{ info.subscription?.plan?.name ?? ('platform.noPlan' | transloco) }}</span>
                        @if (info.subscription?.status; as planStatus) {
                          <app-status-badge [status]="planStatus" [label]="planStatusLabel(planStatus)" />
                        }
                      </dd>
                    </div>
                    <div class="bg-surface p-4">
                      <dt class="field-label">{{ 'settings.tenant.members' | transloco }}</dt>
                      <dd class="mt-1 text-sm font-medium">{{ format.number(info.usage.members) }}</dd>
                    </div>
                  </dl>

                  <div class="mt-5 grid gap-4 sm:grid-cols-2">
                    <div class="rounded-xl border border-line bg-surface-2 p-4">
                      <div class="flex items-center justify-between gap-2">
                        <p class="field-label">{{ 'platform.usage.students' | transloco }}</p>
                        <p class="text-[11.5px] text-ink-3">
                          {{ 'settings.tenant.studentsUsage' | transloco: { used: format.number(info.usage.students), max: maxLabel(info.usage.maxStudents) } }}
                        </p>
                      </div>
                      <app-progress class="mt-3 block" [value]="studentsPercent()" tone="accent" />
                    </div>
                    <div class="rounded-xl border border-line bg-surface-2 p-4">
                      <div class="flex items-center justify-between gap-2">
                        <p class="field-label">{{ 'platform.usage.teachers' | transloco }}</p>
                        <p class="text-[11.5px] text-ink-3">
                          {{ 'settings.tenant.teachersUsage' | transloco: { used: format.number(info.usage.teachers), max: maxLabel(info.usage.maxTeachers) } }}
                        </p>
                      </div>
                      <app-progress class="mt-3 block" [value]="teachersPercent()" tone="success" />
                    </div>
                  </div>

                  <div class="alert alert-info mt-5">
                    <app-icon name="info" [size]="16" class="mt-0.5 shrink-0" />
                    <p>{{ 'settings.tenant.readOnlyHint' | transloco }}</p>
                  </div>
                </div>
              </section>

              <section class="card">
                <div class="card-head">
                  <h2 class="text-[15px] font-semibold">{{ 'settings.tenant.branches' | transloco }}</h2>
                  <span class="badge badge-neutral">{{ info.branches.length }}</span>
                </div>
                <div class="card-pad">
                  @if (info.branches.length === 0) {
                    <p class="text-[13px] text-ink-3">{{ 'common.noResults' | transloco }}</p>
                  } @else {
                    <ul class="divide-y divide-line">
                      @for (branch of info.branches; track branch.id) {
                        <li class="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                          <span class="icon-box h-8 w-8 shrink-0"><app-icon name="building" [size]="14" /></span>
                          <div class="min-w-0">
                            <p class="truncate text-[13px] font-semibold">{{ branch.name }}</p>
                            <p class="text-[11.5px] text-ink-3">
                              {{ branch.code }}@if (branch.city) { · {{ branch.city }} }
                            </p>
                          </div>
                          @if (!branch.isActive) {
                            <span class="badge badge-neutral ml-auto">{{ 'common.inactive' | transloco }}</span>
                          }
                        </li>
                      }
                    </ul>
                  }
                </div>
              </section>
            </div>
          }
        }
        @case ('calendar') {
          @if (tenant(); as info) {
            <app-school-calendar [branches]="info.branches" />
          } @else {
            <div class="skeleton h-72 rounded-2xl"></div>
          }
        }
        @case ('deleted') {
          <app-deleted-items />
        }
      }

      <section class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2/60 px-5 py-4">
        <div>
          <p class="text-[13px] font-semibold">{{ 'settings.signOut' | transloco }}</p>
          <p class="text-[11.5px] text-ink-3">{{ auth.user()?.email }}</p>
        </div>
        <button type="button" class="btn btn-danger-soft" [disabled]="signingOut()" (click)="signOut()">
          <app-icon name="logout" [size]="15" />
          {{ 'settings.signOut' | transloco }}
        </button>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  readonly auth = inject(AuthService);
  readonly format = inject(FormatService);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);

  readonly tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'profile', label: 'settings.tabs.profile', icon: 'user' },
    { id: 'security', label: 'settings.tabs.security', icon: 'lock' },
    { id: 'preferences', label: 'settings.tabs.preferences', icon: 'sun' },
    { id: 'tenant', label: 'settings.tabs.tenant', icon: 'building' },
    { id: 'calendar', label: 'settings.tabs.calendar', icon: 'calendar' },
    { id: 'deleted', label: 'settings.tabs.deleted', icon: 'trash' },
  ];

  readonly tab = signal<TabId>('profile');
  readonly savingPassword = signal(false);
  readonly passwordError = signal(false);
  readonly signingOut = signal(false);
  readonly tenant = signal<TenantInfo | null>(null);
  readonly loadingTenant = signal(true);

  readonly passwordForm = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  readonly studentsPercent = computed(() => {
    const info = this.tenant();
    if (!info || !info.usage.maxStudents) return 0;
    return Math.min(100, Math.round((info.usage.students / info.usage.maxStudents) * 100));
  });

  readonly teachersPercent = computed(() => {
    const info = this.tenant();
    if (!info || !info.usage.maxTeachers) return 0;
    return Math.min(100, Math.round((info.usage.teachers / info.usage.maxTeachers) * 100));
  });

  constructor() {
    void this.loadTenant();
  }

  selectTab(tab: TabId): void {
    this.tab.set(tab);
  }

  maxLabel(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : this.format.number(value);
  }

  planStatusLabel(status: string): string {
    const key = `status.${status}`;
    const label = this.transloco.translate(key);
    return label === key ? status.replaceAll('_', ' ') : label;
  }

  async submitPassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.passwordError.set(false);
    this.savingPassword.set(true);
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    try {
      await this.auth.changePassword(currentPassword, newPassword);
      this.toast.success(this.transloco.translate('settings.security.changed'));
      await this.router.navigateByUrl('/login');
    } catch {
      this.passwordError.set(true);
    } finally {
      this.savingPassword.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.auth.logout();
    } catch {
      // The session is cleared even when the logout request fails.
    } finally {
      this.signingOut.set(false);
      await this.router.navigateByUrl('/login');
    }
  }

  private async loadTenant(): Promise<void> {
    this.loadingTenant.set(true);
    try {
      const info = await firstValueFrom(this.api.get<TenantInfo>('/tenant'));
      this.tenant.set(info);
    } catch {
      this.tenant.set(null);
    } finally {
      this.loadingTenant.set(false);
    }
  }
}
