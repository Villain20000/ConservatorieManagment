import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../core/auth.service';
import { LanguageService } from '../core/language.service';
import { ThemeService } from '../core/theme.service';
import { IconComponent } from '../shared/ui/icon';

@Component({
  selector: 'app-platform-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe, IconComponent],
  template: `
    <div class="min-h-screen bg-canvas">
      <header class="sticky top-0 z-40 bg-sidebar text-sidebar-ink shadow-sidebar">
        <div
          class="mx-auto flex min-h-16 w-full max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6"
        >
          <a routerLink="/platform" class="flex min-w-0 items-center gap-2.5">
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
            >
              <app-icon name="music" [size]="17" />
            </span>
            <span class="truncate text-[15px] font-semibold tracking-tight text-sidebar-ink-strong">
              {{ 'common.appName' | transloco }}
            </span>
            <span class="hidden h-4 w-px bg-sidebar-line sm:block"></span>
            <span
              class="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-ink/60 sm:block"
            >
              {{ 'platform.title' | transloco }}
            </span>
          </a>

          <nav class="order-last w-full sm:order-none sm:ml-2 sm:w-auto">
            <a
              routerLink="/platform"
              routerLinkActive="bg-white/[0.08] text-sidebar-ink-strong"
              [routerLinkActiveOptions]="{ exact: true }"
              class="inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-[12.5px] font-medium text-sidebar-ink transition hover:bg-white/[0.055] hover:text-sidebar-ink-strong"
            >
              <app-icon name="grid" [size]="15" />
              <span>{{ 'platform.overview' | transloco }}</span>
            </a>
          </nav>

          <div class="ml-auto flex shrink-0 items-center gap-1.5">
            <span
              class="hidden max-w-[160px] truncate text-[12px] font-medium text-sidebar-ink-strong sm:block"
            >
              {{ auth.displayName() }}
            </span>
            <span class="badge bg-white/10 text-sidebar-ink-strong">
              {{ 'roles.PLATFORM' | transloco }}
            </span>
            <span class="mx-1 hidden h-5 w-px bg-sidebar-line sm:block"></span>
            <button
              type="button"
              class="flex h-8 min-w-9 items-center justify-center rounded-lg px-2 text-[11px] font-bold tracking-wide text-sidebar-ink/80 transition hover:bg-white/[0.06] hover:text-sidebar-ink-strong"
              (click)="language.toggle()"
              [attr.aria-label]="'common.language' | transloco"
            >
              {{ language.current() === 'el' ? 'EL' : 'EN' }}
            </button>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-ink/80 transition hover:bg-white/[0.06] hover:text-sidebar-ink-strong"
              (click)="theme.toggle()"
              [attr.aria-label]="'common.theme' | transloco"
            >
              <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="17" />
            </button>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-ink/80 transition hover:bg-white/[0.06] hover:text-sidebar-ink-strong"
              (click)="logout()"
              [attr.aria-label]="'common.logout' | transloco"
            >
              <app-icon name="logout" [size]="17" />
            </button>
          </div>
        </div>
      </header>

      <main class="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6">
        <router-outlet />
      </main>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformShell {
  readonly auth = inject(AuthService);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  async logout(): Promise<void> {
    try {
      await this.auth.logout();
    } catch {
      // The local session is cleared even if the request fails.
    }
    await this.router.navigate(['/login']);
  }
}
