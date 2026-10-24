import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { addDaysKey, athensDateKey, startOfWeekKey, todayKey, weekDayKeys } from '../../core/dates';
import { FormatService } from '../../core/format.service';
import type { Lesson } from '../../core/models';
import { PortalContextService } from '../../core/portal-context.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';
import { PortalChildSelectorComponent } from './portal-child-selector';

interface DayGroup {
  key: string;
  lessons: Lesson[];
}

@Component({
  selector: 'app-portal-schedule',
  imports: [SHARED_IMPORTS, PortalChildSelectorComponent],
  template: `
    <div class="page">
      <app-page-header
        eyebrow="portal.eyebrow"
        title="portal.schedule.title"
        subtitle="portal.schedule.subtitle"
      />

      <app-portal-child-selector (changed)="reload()" />

      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p class="text-[13px] font-semibold text-ink-2">
          {{ 'schedule.weekOf' | transloco: { range: weekLabel() } }}
        </p>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="btn btn-secondary btn-icon"
            [attr.aria-label]="'schedule.previousWeek' | transloco"
            [attr.title]="'schedule.previousWeek' | transloco"
            (click)="shiftWeek(-1)"
          >
            <app-icon name="chevron-left" [size]="16" />
          </button>
          <button type="button" class="btn btn-secondary btn-sm" (click)="goToday()">
            {{ 'common.today' | transloco }}
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-icon"
            [attr.aria-label]="'schedule.nextWeek' | transloco"
            [attr.title]="'schedule.nextWeek' | transloco"
            (click)="shiftWeek(1)"
          >
            <app-icon name="chevron-right" [size]="16" />
          </button>
        </div>
      </div>

      @if (loading()) {
        <div class="space-y-4">
          <div class="skeleton h-5 w-36"></div>
          <div class="grid gap-3 lg:grid-cols-2">
            <div class="skeleton h-32 rounded-2xl"></div>
            <div class="skeleton h-32 rounded-2xl"></div>
          </div>
        </div>
      } @else if (days().length === 0) {
        <div class="card">
          <app-empty-state title="portal.schedule.empty" icon="calendar" />
        </div>
      } @else {
        <div class="space-y-7">
          @for (day of days(); track day.key) {
            <section>
              <div class="mb-2.5 flex items-center gap-3">
                <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
                  {{ format.date(day.key, 'weekday') }}
                </h2>
                <span class="h-px flex-1 bg-line"></span>
                <span class="text-[11px] font-medium text-ink-3">{{ day.lessons.length }}</span>
              </div>

              <div class="grid gap-3 lg:grid-cols-2">
                @for (lesson of day.lessons; track lesson.id) {
                  <article
                    class="card p-4"
                    [class.border-danger]="lesson.status === 'CANCELLED'"
                    [class.bg-danger-soft]="lesson.status === 'CANCELLED'"
                  >
                    <div class="flex gap-4">
                      <div class="w-[74px] shrink-0">
                        <p class="text-[13px] font-semibold tabular-nums leading-tight">
                          {{ format.timeRange(lesson.startsAt, lesson.endsAt) }}
                        </p>
                        <p class="mt-1 text-[10.5px] font-medium uppercase tracking-wide text-ink-3">
                          {{ ('lessonType.' + lesson.type) | transloco }}
                        </p>
                      </div>

                      <div class="min-w-0 flex-1">
                        <div class="flex items-start justify-between gap-2">
                          <h3 class="text-[14px] font-semibold leading-snug">
                            {{ lesson.title || lesson.lessonSeries?.title || ('common.noneFound' | transloco) }}
                          </h3>
                          <app-status-badge [status]="lesson.status" />
                        </div>

                        <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
                          @if (lesson.lessonSeries?.program?.name; as program) {
                            <span class="inline-flex items-center gap-1">
                              <span
                                class="h-2 w-2 rounded-full"
                                [style.background]="lesson.lessonSeries?.program?.color || 'var(--accent)'"
                              ></span>
                              {{ program }}
                            </span>
                          }
                          @if (lesson.lessonSeries?.level?.name; as level) {
                            <span>{{ level }}</span>
                          }
                          @if (lesson.room?.name; as room) {
                            <span class="inline-flex items-center gap-1">
                              <app-icon name="map-pin" [size]="12" />
                              {{ room }}
                            </span>
                          }
                          @if (teacherName(lesson); as teacher) {
                            <span class="inline-flex items-center gap-1">
                              <app-icon name="user" [size]="12" />
                              {{ teacher }}
                            </span>
                          }
                        </div>

                        @if (lesson.status === 'CANCELLED') {
                          <p class="mt-2 flex items-start gap-1.5 text-[11.5px] font-medium text-danger">
                            <app-icon name="alert" [size]="13" class="mt-0.5 shrink-0" />
                            <span>{{ lesson.cancellationReason || ('status.CANCELLED' | transloco) }}</span>
                          </p>
                        }
                      </div>
                    </div>
                  </article>
                }
              </div>
            </section>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalSchedulePage {
  private readonly api = inject(ApiService);
  protected readonly portal = inject(PortalContextService);
  readonly format = inject(FormatService);

  readonly weekStart = signal(startOfWeekKey(todayKey()));
  readonly lessons = signal<Lesson[]>([]);
  readonly loading = signal(true);

  readonly weekLabel = computed(() => {
    const start = this.weekStart();
    return `${this.format.date(start, 'dayMonth')} – ${this.format.date(addDaysKey(start, 6), 'dayMonth')}`;
  });

  readonly days = computed<DayGroup[]>(() => {
    const grouped = new Map<string, Lesson[]>();
    for (const lesson of this.lessons()) {
      const key = athensDateKey(lesson.startsAt);
      const list = grouped.get(key);
      if (list) list.push(lesson);
      else grouped.set(key, [lesson]);
    }
    return weekDayKeys(this.weekStart())
      .filter((key) => grouped.has(key))
      .map((key) => ({
        key,
        lessons: (grouped.get(key) ?? []).sort(
          (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
        ),
      }));
  });

  constructor() {
    void this.portal.ensureLoaded().then(() => this.load());
  }

  reload(): void {
    void this.load();
  }

  shiftWeek(offset: number): void {
    this.weekStart.update((key) => addDaysKey(key, offset * 7));
    void this.load();
  }

  goToday(): void {
    this.weekStart.set(startOfWeekKey(todayKey()));
    void this.load();
  }

  teacherName(lesson: Lesson): string {
    return lesson.teacher ? `${lesson.teacher.firstName} ${lesson.teacher.lastName}`.trim() : '';
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const from = this.weekStart();
      const response = await firstValueFrom(
        this.api.list<Lesson>('/portal/schedule', {
          from,
          to: addDaysKey(from, 6),
          ...this.portal.childParam(),
        }),
      );
      this.lessons.set(response.data);
    } catch {
      this.lessons.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
