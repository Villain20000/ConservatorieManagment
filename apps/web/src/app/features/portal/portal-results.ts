import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FormatService } from '../../core/format.service';
import type { ExamResult } from '../../core/models';
import { PortalContextService } from '../../core/portal-context.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';
import { PortalChildSelectorComponent } from './portal-child-selector';

@Component({
  selector: 'app-portal-results',
  imports: [SHARED_IMPORTS, PortalChildSelectorComponent],
  template: `
    <div class="page">
      <app-page-header
        eyebrow="portal.eyebrow"
        title="portal.results.title"
        subtitle="portal.results.subtitle"
      />

      <app-portal-child-selector (changed)="reload()" />

      @if (loading()) {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          @for (item of skeletons; track item) {
            <div class="skeleton h-52 rounded-2xl"></div>
          }
        </div>
      } @else if (results().length === 0) {
        <div class="card">
          <app-empty-state title="portal.results.empty" icon="award" />
        </div>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          @for (result of results(); track result.id) {
            <article class="card relative overflow-hidden">
              <span class="absolute inset-x-0 top-0 h-[3px] bg-accent"></span>
              <div class="card-pad">
                <div class="flex items-start justify-between gap-3">
                  <span class="icon-box"><app-icon name="award" [size]="18" /></span>
                  <app-status-badge [status]="result.outcome" />
                </div>

                <h2 class="mt-4 text-[15px] font-semibold leading-snug">
                  {{ result.exam?.title || ('common.noneFound' | transloco) }}
                </h2>

                <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
                  @if (result.exam?.program?.name; as program) {
                    <span>{{ program }}</span>
                  }
                  @if (result.exam?.level?.name; as level) {
                    <span class="text-line-strong">·</span>
                    <span>{{ level }}</span>
                  }
                  @if (result.exam?.examDate; as examDate) {
                    <span class="text-line-strong">·</span>
                    <span>{{ format.date(examDate) }}</span>
                  }
                </div>

                <div class="mt-4 flex items-end justify-between gap-3 border-t border-line pt-4">
                  <div>
                    <p class="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                      {{ 'portal.results.grade' | transloco }}
                    </p>
                    <p class="mt-1 text-[30px] font-semibold leading-none tracking-tight text-accent-strong tabular-nums">
                      {{ result.grade || '—' }}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                      {{ 'portal.results.published' | transloco }}
                    </p>
                    <p class="mt-1 text-[11.5px] text-ink-2">
                      {{ result.publishedAt ? format.date(result.publishedAt) : '—' }}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalResultsPage {
  private readonly api = inject(ApiService);
  protected readonly portal = inject(PortalContextService);
  readonly format = inject(FormatService);

  readonly results = signal<ExamResult[]>([]);
  readonly loading = signal(true);
  readonly skeletons = [1, 2, 3];

  constructor() {
    void this.portal.ensureLoaded().then(() => this.load());
  }

  reload(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const results = await firstValueFrom(
        this.api.get<ExamResult[]>('/portal/results', this.portal.childParam()),
      );
      this.results.set(results);
    } catch {
      this.results.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
