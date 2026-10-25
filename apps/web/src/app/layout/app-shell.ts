import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { EntitlementsService } from '../core/entitlements.service';
import { FormatService } from '../core/format.service';
import { LanguageService } from '../core/language.service';
import { navSectionsFor } from '../core/nav';
import { ThemeService } from '../core/theme.service';
import type { AppNotification, Membership } from '../core/models';
import { AvatarComponent } from '../shared/ui/avatar';
import { IconComponent } from '../shared/ui/icon';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    AvatarComponent,
    IconComponent,
  ],
  template: `
    <div class="min-h-screen bg-canvas">
      @if (mobileOpen()) {
        <div
          class="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] animate-fade-in lg:hidden"
          (click)="closeMobile()"
          aria-hidden="true"
        ></div>
      }

      @if (overlayOpen()) {
        <div class="fixed inset-0 z-20" (click)="closeOverlays()" aria-hidden="true"></div>
      }

      <aside
        class="fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-sidebar-line bg-sidebar text-sidebar-ink shadow-sidebar transition-transform duration-200 ease-out lg:translate-x-0"
        [class.-translate-x-full]="!mobileOpen()"
      >
        <div class="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-line px-4">
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
          >
            <app-icon name="music" [size]="20" />
          </span>
          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-[15px] font-semibold tracking-tight text-sidebar-ink-strong"
            >
              {{ 'common.appName' | transloco }}
            </span>
            <span
              class="block truncate text-[9.5px] font-semibold uppercase tracking-[0.18em] text-sidebar-ink/50"
            >
              {{ 'common.appTagline' | transloco }}
            </span>
          </span>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-ink/70 transition hover:bg-white/[0.06] hover:text-sidebar-ink-strong lg:hidden"
            (click)="closeMobile()"
            [attr.aria-label]="'common.close' | transloco"
          >
            <app-icon name="x" [size]="17" />
          </button>
        </div>

        <div class="shrink-0 px-3 pt-3">
          <div class="relative">
            @if (canSwitchTenant()) {
              <button
                type="button"
                class="flex w-full items-center gap-2.5 rounded-xl border border-sidebar-line bg-white/[0.03] px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
                (click)="tenantMenuOpen.set(!tenantMenuOpen())"
                [attr.aria-expanded]="tenantMenuOpen()"
              >
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent"
                >
                  <app-icon name="building" [size]="15" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[12.5px] font-semibold text-sidebar-ink-strong">
                    {{ tenantName() }}
                  </span>
                  <span
                    class="mt-0.5 inline-flex max-w-full truncate rounded-full bg-white/[0.06] px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-sidebar-ink/65"
                  >
                    {{ roleKey() | transloco }}
                  </span>
                </span>
                <app-icon
                  name="chevron-down"
                  [size]="14"
                  class="shrink-0 text-sidebar-ink/50 transition-transform"
                  [class.rotate-180]="tenantMenuOpen()"
                />
              </button>

              @if (tenantMenuOpen()) {
                <div
                  class="menu absolute left-0 right-0 top-full z-50 mt-2 max-h-[320px] overflow-y-auto animate-scale-in"
                >
                  @for (membership of auth.memberships(); track membership.id) {
                    <button
                      type="button"
                      class="menu-item"
                      [disabled]="switchingTenant()"
                      (click)="switchTenant(membership)"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-[12.5px] font-semibold text-ink">
                          {{ membership.tenant.name }}
                        </span>
                        <span class="block truncate text-[10.5px] text-ink-3">
                          {{ 'roles.' + membership.role | transloco }}
                        </span>
                      </span>
                      @if (membership.tenantId === auth.activeTenant()?.tenantId) {
                        <app-icon name="check" [size]="14" class="shrink-0 text-accent-strong" />
                      }
                    </button>
                  }
                </div>
              }
            } @else {
              <div
                class="flex items-center gap-2.5 rounded-xl border border-sidebar-line bg-white/[0.03] px-3 py-2.5"
              >
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent"
                >
                  <app-icon name="building" [size]="15" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[12.5px] font-semibold text-sidebar-ink-strong">
                    {{ tenantName() }}
                  </span>
                  <span
                    class="mt-0.5 inline-flex max-w-full truncate rounded-full bg-white/[0.06] px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-sidebar-ink/65"
                  >
                    {{ roleKey() | transloco }}
                  </span>
                </span>
              </div>
            }
          </div>
        </div>

        <nav class="mt-1 flex-1 overflow-y-auto px-3 pb-4">
          @for (section of sections(); track section.labelKey) {
            <p class="nav-section">{{ section.labelKey | transloco }}</p>
            <div class="space-y-0.5">
              @for (item of section.items; track item.route) {
                <a
                  [routerLink]="item.route"
                  routerLinkActive="nav-item-active"
                  [routerLinkActiveOptions]="{
                    exact: item.exact ?? item.route === '/app/dashboard',
                  }"
                  class="nav-item"
                  (click)="closeMobile()"
                >
                  <app-icon [name]="item.icon" [size]="17" />
                  <span>{{ item.labelKey | transloco }}</span>
                </a>
              }
            </div>
          }
        </nav>

        <div class="shrink-0 border-t border-sidebar-line p-3">
          <div
            class="flex items-center gap-2.5 rounded-xl border border-sidebar-line bg-white/[0.03] p-2.5"
          >
            @if (auth.user(); as user) {
              <app-avatar [firstName]="user.firstName" [lastName]="user.lastName" [size]="34" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[12px] font-semibold text-sidebar-ink-strong">
                  {{ auth.displayName() }}
                </span>
                <span class="block truncate text-[10.5px] text-sidebar-ink/60">
                  {{ roleKey() | transloco }}
                </span>
              </span>
            }
            <button
              type="button"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-ink/60 transition hover:bg-white/[0.06] hover:text-sidebar-ink-strong"
              (click)="logout()"
              [attr.aria-label]="'common.logout' | transloco"
            >
              <app-icon name="logout" [size]="16" />
            </button>
          </div>
        </div>
      </aside>

      <div class="lg:pl-[264px]">
        <header
          class="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-canvas/85 px-3 backdrop-blur sm:px-5 lg:px-8"
        >
          <button
            type="button"
            class="btn btn-ghost btn-icon shrink-0 lg:hidden"
            (click)="mobileOpen.set(true)"
            [attr.aria-label]="'common.open' | transloco"
          >
            <app-icon name="menu" [size]="19" />
          </button>

          @if (auth.has('students.read')) {
            <form
              class="hidden min-w-0 flex-1 sm:block sm:max-w-sm"
              (submit)="submitSearch($event)"
              role="search"
            >
              <div class="relative">
                <app-icon
                  name="search"
                  [size]="16"
                  class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                />
                <input
                  id="global-search"
                  name="search"
                  type="search"
                  class="input h-9 pl-9"
                  [value]="searchTerm()"
                  (input)="onSearchInput($event)"
                  [placeholder]="'common.searchPlaceholder' | transloco"
                  [attr.aria-label]="'common.search' | transloco" autocomplete="off" />
              </div>
            </form>
          }

          <div class="ml-auto flex shrink-0 items-center gap-1">
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
            <button
              type="button"
              class="btn btn-ghost btn-icon-sm relative"
              (click)="toggleNotifications()"
              [attr.aria-label]="'common.notifications' | transloco"
              [attr.aria-expanded]="notificationsOpen()"
            >
              <app-icon name="bell" [size]="18" />
              @if (unread() > 0) {
                <span
                  class="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-accent-ink"
                >
                  {{ unread() > 9 ? '9+' : unread() }}
                </span>
              }
            </button>
            <button
              type="button"
              class="ml-0.5 flex items-center gap-1 rounded-xl p-0.5 transition hover:bg-surface-3"
              (click)="toggleAvatarMenu()"
              [attr.aria-label]="'common.profile' | transloco"
              [attr.aria-expanded]="avatarMenuOpen()"
            >
              @if (auth.user(); as user) {
                <app-avatar [firstName]="user.firstName" [lastName]="user.lastName" [size]="30" />
              }
              <app-icon name="chevron-down" [size]="14" class="hidden text-ink-3 sm:block" />
            </button>
          </div>
        </header>

        @if (entitlements.isSuspended()) {
          <div class="border-b border-danger/30 bg-danger-soft px-4 py-3 lg:px-8" role="alert">
            <div class="mx-auto flex max-w-[1600px] items-start gap-3">
              <app-icon name="alert" [size]="16" class="mt-0.5 text-danger" />
              <div class="text-[12.5px] leading-relaxed">
                <p class="font-semibold text-ink">{{ 'entitlements.suspended' | transloco }}</p>
                <p class="text-ink-2">{{ 'entitlements.suspendedHint' | transloco }}</p>
              </div>
            </div>
          </div>
        } @else if (entitlements.state() === 'TRIAL_EXPIRED') {
          <div class="border-b border-danger/30 bg-danger-soft px-4 py-3 lg:px-8" role="status">
            <div class="mx-auto flex max-w-[1600px] items-start gap-3">
              <app-icon name="alert" [size]="16" class="mt-0.5 text-danger" />
              <p class="text-[12.5px] font-semibold text-ink">
                {{ 'entitlements.trialExpired' | transloco }}
              </p>
            </div>
          </div>
        } @else if (entitlements.state() === 'TRIAL' && (entitlements.trialDaysLeft() ?? 99) <= 14) {
          <div class="border-b border-warning/30 bg-warning-soft px-4 py-3 lg:px-8" role="status">
            <div class="mx-auto flex max-w-[1600px] items-start gap-3">
              <app-icon name="clock" [size]="16" class="mt-0.5 text-warning" />
              <p class="text-[12.5px] font-semibold text-ink">
                {{ 'entitlements.trialLeft' | transloco: { count: entitlements.trialDaysLeft() } }}
              </p>
            </div>
          </div>
        }

        <main class="page py-6 lg:py-8">
          <router-outlet />
        </main>
      </div>

      @if (notificationsOpen()) {
        <div
          class="fixed right-3 top-[68px] z-50 w-[380px] max-w-[calc(100vw_-_1.5rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-scale-in"
          role="dialog"
          [attr.aria-label]="'common.notifications' | transloco"
        >
          <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div class="flex min-w-0 items-center gap-2">
              <span class="truncate text-[13px] font-semibold text-ink">
                {{ 'common.notifications' | transloco }}
              </span>
              @if (unread() > 0) {
                <span class="badge badge-accent">{{ unread() }}</span>
              }
            </div>
            <button
              type="button"
              class="shrink-0 text-[11.5px] font-semibold text-accent-strong transition hover:underline disabled:pointer-events-none disabled:opacity-40"
              [disabled]="unread() === 0 || markingAll()"
              (click)="markAllRead()"
            >
              {{ 'common.markAllRead' | transloco }}
            </button>
          </div>

          <div class="max-h-[22rem] overflow-y-auto">
            @if (notificationsLoading() && notifications().length === 0) {
              <div class="space-y-2 p-4">
                <div class="skeleton h-11"></div>
                <div class="skeleton h-11"></div>
                <div class="skeleton h-11"></div>
              </div>
            } @else if (notifications().length === 0) {
              <p class="px-4 py-10 text-center text-[12.5px] text-ink-3">
                {{ 'common.noNotifications' | transloco }}
              </p>
            } @else {
              @for (item of notifications(); track item.id) {
                <button
                  type="button"
                  class="flex w-full items-start gap-2.5 border-b border-line/70 px-4 py-3 text-left transition last:border-b-0 hover:bg-surface-2"
                  (click)="openNotification(item)"
                >
                  <span
                    class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    [class.bg-accent]="!item.readAt"
                    [class.bg-transparent]="item.readAt"
                  ></span>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-start justify-between gap-2">
                      <span class="text-[12.5px] font-semibold leading-snug text-ink">{{
                        item.title
                      }}</span>
                      <span class="shrink-0 text-[10.5px] leading-5 text-ink-3">
                        {{ format.timeAgo(item.createdAt) }}
                      </span>
                    </span>
                    <span class="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-ink-2">
                      {{ item.body }}
                    </span>
                  </span>
                </button>
              }
            }
          </div>
        </div>
      }

      @if (avatarMenuOpen()) {
        <div class="menu fixed right-3 top-[68px] z-50 w-60 animate-scale-in">
          @if (auth.user(); as user) {
            <div class="flex items-center gap-2.5 px-2.5 py-2">
              <app-avatar [firstName]="user.firstName" [lastName]="user.lastName" [size]="32" />
              <span class="min-w-0">
                <span class="block truncate text-[12.5px] font-semibold text-ink">{{
                  auth.displayName()
                }}</span>
                <span class="block truncate text-[11px] text-ink-3">{{ user.email }}</span>
              </span>
            </div>
            <div class="my-1 h-px bg-line"></div>
          }
          <a routerLink="/app/settings" class="menu-item" (click)="avatarMenuOpen.set(false)">
            <app-icon name="settings" [size]="15" />
            <span>{{ 'common.settings' | transloco }}</span>
          </a>
          <button type="button" class="menu-item menu-item-danger" (click)="logout()">
            <app-icon name="logout" [size]="15" />
            <span>{{ 'common.logout' | transloco }}</span>
          </button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  readonly auth = inject(AuthService);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);
  readonly format = inject(FormatService);
  readonly entitlements = inject(EntitlementsService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly mobileOpen = signal(false);
  readonly tenantMenuOpen = signal(false);
  readonly notificationsOpen = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly notifications = signal<AppNotification[]>([]);
  readonly unread = signal(0);
  readonly notificationsLoading = signal(false);
  readonly markingAll = signal(false);
  readonly switchingTenant = signal(false);
  readonly searchTerm = signal('');

  readonly sections = computed(() =>
    navSectionsFor(
      this.auth.role(),
      (permission) => this.auth.has(permission),
      (feature) => this.entitlements.has(feature),
    ),
  );
  readonly canSwitchTenant = computed(() => this.auth.memberships().length > 1);
  readonly tenantName = computed(() => this.auth.activeTenant()?.tenant.name ?? '');
  readonly roleKey = computed(() => {
    const role = this.auth.role();
    return role ? `roles.${role}` : 'common.unknown';
  });
  readonly overlayOpen = computed(
    () => this.tenantMenuOpen() || this.notificationsOpen() || this.avatarMenuOpen(),
  );

  constructor() {
    void this.loadNotifications();
    // Tenant plan state drives the banner and feature visibility. A platform
    // admin has no tenant, in which case the service resolves to null.
    void this.entitlements.load();

    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.closeOverlays();
      }
    });
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
    this.tenantMenuOpen.set(false);
  }

  closeOverlays(): void {
    this.tenantMenuOpen.set(false);
    this.notificationsOpen.set(false);
    this.avatarMenuOpen.set(false);
  }

  toggleNotifications(): void {
    const next = !this.notificationsOpen();
    this.closeOverlays();
    this.notificationsOpen.set(next);
  }

  toggleAvatarMenu(): void {
    const next = !this.avatarMenuOpen();
    this.closeOverlays();
    this.avatarMenuOpen.set(next);
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  submitSearch(event: Event): void {
    event.preventDefault();
    const term = this.searchTerm().trim();
    if (!term) return;
    this.mobileOpen.set(false);
    void this.router.navigate(['/app/students'], { queryParams: { search: term } });
  }

  async switchTenant(membership: Membership): Promise<void> {
    if (this.switchingTenant()) return;
    this.switchingTenant.set(true);
    try {
      await this.auth.selectTenant(membership.tenantId);
      this.tenantMenuOpen.set(false);
      await this.loadNotifications();
      await this.router.navigateByUrl('/app/dashboard');
    } catch {
      // Errors surface through the global interceptor; keep the current tenant.
    } finally {
      this.switchingTenant.set(false);
    }
  }

  async openNotification(item: AppNotification): Promise<void> {
    if (!item.readAt) {
      try {
        await firstValueFrom(this.api.patch(`/notifications/${item.id}/read`));
        await this.loadNotifications();
      } catch {
        return;
      }
    }

    const target =
      item.entityType === 'ANNOUNCEMENT'
        ? '/app/announcements'
        : item.entityType === 'LESSON'
          ? '/app/schedule'
          : null;

    if (target) {
      this.notificationsOpen.set(false);
      await this.router.navigateByUrl(target);
    }
  }

  async markAllRead(): Promise<void> {
    if (this.markingAll() || this.unread() === 0) return;
    this.markingAll.set(true);
    try {
      await firstValueFrom(this.api.post('/notifications/read-all'));
      await this.loadNotifications();
      this.unread.set(0);
    } catch {
      // Global interceptor reports the failure.
    } finally {
      this.markingAll.set(false);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.auth.logout();
    } catch {
      // The local session is cleared even if the request fails.
    }
    this.closeOverlays();
    this.mobileOpen.set(false);
    await this.router.navigate(['/login']);
  }

  private async loadNotifications(): Promise<void> {
    this.notificationsLoading.set(true);
    try {
      const response = await firstValueFrom(
        this.api.list<AppNotification>('/notifications', { page: 1, pageSize: 8 }),
      );
      this.notifications.set(response.data);
      this.unread.set(response.meta?.unread ?? 0);
    } catch {
      // Global interceptor reports the failure; keep the previous list.
    } finally {
      this.notificationsLoading.set(false);
    }
  }
}
