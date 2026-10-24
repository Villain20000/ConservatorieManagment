import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FormatService } from '../../core/format.service';
import type { Attendance, AttendanceSummary } from '../../core/models';
import { PortalContextService } from '../../core/portal-context.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';
import { PortalChildSelectorComponent } from './portal-child-selector';

@Component({
  selector: 'app-portal-attendance',
  imports: [SHARED_IMPORTS, PortalChildSelectorComponent],
  template: `
    <div class="page">
      <app-page-header
        eyebrow="portal.eyebrow"
        title="portal.attendance.title"
        subtitle="portal.attendance.subtitle"
      />

      <app-portal-child-selector (changed)="reload()" />

      @if (loading()) {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          @for (item of skeletons; track item) {
            <div class="skeleton h-28 rounded-2xl"></div>
          }
        </div>
        <div class="skeleton mt-4 h-72 rounded-2xl"></div>
      } @else {
        @if (summary(); as stats) {
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <app-stat-card
              label="portal.attendance.rate"
              [value]="format.percent(stats.rate)"
              icon="percent"
              tone="accent"
            />
            <app-stat-card
              label="portal.attendance.present"
              [value]="format.number(stats.PRESENT)"
              icon="check-circle"
              tone="success"
            />
            <app-stat-card
              label="portal.attendance.absent"
              [value]="format.number(stats.ABSENT)"
              icon="alert"
              tone="danger"
            />
            <app-stat-card
              label="portal.attendance.late"
              [value]="format.number(stats.LATE)"
              icon="clock"
              tone="warning"
            />
          </div>

          <div class="card card-pad mt-4">
            <div class="flex items-center justify-between gap-3">
              <p class="field-label">{{ 'portal.attendance.rate' | transloco }}</p>
              <p class="text-[12px] font-semibold tabular-nums text-ink-2">{{ format.percent(stats.rate) }}</p>
            </div>
            <app-progress class="mt-2 block" [value]="rate()" tone="success" />
            <p class="mt-2 text-[11.5px] text-ink-3">
              {{ 'portal.attendance.total' | transloco }}: {{ format.number(stats.total) }}
            </p>
          </div>
        }

        @if (rows().length === 0) {
          <div class="card mt-4">
            <app-empty-state title="portal.attendance.empty" icon="calendar" />
          </div>
        } @else {
          <div class="table-wrap mt-4">
            <table class="table">
              <thead>
                <tr>
                  <th>{{ 'portal.attendance.date' | transloco }}</th>
                  <th>{{ 'portal.attendance.lesson' | transloco }}</th>
                  <th>{{ 'portal.attendance.status' | transloco }}</th>
                  <th>{{ 'portal.attendance.late' | transloco }}</th>
                  <th>{{ 'portal.attendance.notes' | transloco }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.id) {
                  <tr>
                    <td class="whitespace-nowrap tabular-nums text-ink">
                      {{ row.lesson ? format.dateTime(row.lesson.startsAt) : format.date(row.markedAt) }}
                    </td>
                    <td>
                      <p class="font-medium text-ink">
                        {{ row.lesson?.title || ('common.noneFound' | transloco) }}
                      </p>
                      @if (row.lesson?.lessonSeries?.program?.name; as program) {
                        <p class="mt-0.5 text-[11.5px] text-ink-3">{{ program }}</p>
                      }
                    </td>
                    <td><app-status-badge [status]="row.status" /></td>
                    <td class="tabular-nums">
                      {{ row.minutesLate !== null ? row.minutesLate + '′' : '—' }}
                    </td>
                    <td class="max-w-[280px] text-[12.5px]">
                      {{ row.notes || '—' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <app-pagination
            [page]="page()"
            [pageSize]="pageSize"
            [total]="total()"
            (pageChange)="goToPage($event)"
          />
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalAttendancePage {
  private readonly api = inject(ApiService);
  protected readonly portal = inject(PortalContextService);
  readonly format = inject(FormatService);

  readonly pageSize = 12;
  readonly skeletons = [1, 2, 3, 4];

  readonly rows = signal<Attendance[]>([]);
  readonly summary = signal<AttendanceSummary | null>(null);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(true);

  readonly rate = computed(() => this.summary()?.rate ?? 0);

  constructor() {
    void this.portal.ensureLoaded().then(() => this.load());
  }

  reload(): void {
    this.page.set(1);
    void this.load();
  }

  goToPage(page: number): void {
    this.page.set(page);
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(
        this.api.list<Attendance>('/portal/attendance', {
          page: this.page(),
          pageSize: this.pageSize,
          ...this.portal.childParam(),
        }),
      );
      this.rows.set(response.data);
      this.total.set(response.meta?.total ?? response.data.length);
      this.summary.set(response.meta?.summary ?? null);
    } catch {
      this.rows.set([]);
      this.total.set(0);
      this.summary.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
