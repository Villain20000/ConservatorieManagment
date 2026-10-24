import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

@Component({
  selector: 'app-not-found',
  imports: [SHARED_IMPORTS],
  template: `
    <main
      class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-6 py-16 text-center"
    >
      <div
        class="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft blur-3xl opacity-60"
        aria-hidden="true"
      ></div>
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
        aria-hidden="true"
      ></div>

      <div class="relative z-10 flex flex-col items-center">
        <div class="flex items-center gap-2 text-accent-strong">
          <app-icon name="music" [size]="18" />
          <span class="eyebrow text-accent-strong">MusicOS</span>
        </div>

        <p
          class="mt-4 select-none bg-gradient-to-b from-accent to-accent-strong bg-clip-text text-[clamp(7rem,24vw,15rem)] font-semibold leading-[0.82] tracking-[-0.07em] text-transparent"
          aria-hidden="true"
        >
          404
        </p>

        <div class="mt-5 h-px w-16 bg-accent"></div>

        <h1 class="mt-6 text-[24px] font-semibold tracking-tight sm:text-[30px]">
          {{ 'notFound.title' | transloco }}
        </h1>
        <p class="mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-2">
          {{ 'notFound.message' | transloco }}
        </p>

        <a routerLink="/app/dashboard" class="btn btn-primary mt-7">
          <app-icon name="dashboard" [size]="15" />
          {{ 'notFound.home' | transloco }}
        </a>
      </div>

      <p class="relative z-10 mt-12 text-[10.5px] font-medium uppercase tracking-[0.18em] text-ink-3">
        {{ 'common.appTagline' | transloco }}
      </p>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
