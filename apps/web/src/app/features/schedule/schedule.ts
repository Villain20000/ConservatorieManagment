import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import {
  addDaysKey,
  athensDateKey,
  athensDateTime,
  athensMinutes,
  athensTimeKey,
  startOfWeekKey,
  todayKey,
  weekDayKeys,
  weekdayNumber,
} from '../../core/dates';
import { FormatService } from '../../core/format.service';
import type {
  Lesson,
  LessonNote,
  LessonSeries,
  LessonType,
  Room,
  ScheduleOptions,
  SeriesStatus,
  Student,
  StudentRef,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';
import { ConflictExplainerComponent } from './conflict-explainer';

interface LessonDetail extends Lesson {
  notes: LessonNote[];
}

interface DayCard {
  lesson: Lesson;
  top: number;
  height: number;
  color: string;
  tint: string;
  cancelled: boolean;
}

interface ScheduleDay {
  key: string;
  weekday: number;
  label: string;
  dayNumber: number;
  isToday: boolean;
  lessons: Lesson[];
  cards: DayCard[];
}

const GRID_START_HOUR = 8;
const GRID_END_HOUR = 22;
const PX_PER_HOUR = 64;
const GRID_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * PX_PER_HOUR;
const MIN_CARD_HEIGHT = 34;
const FALLBACK_COLOR = '#b9893d';

function isValidHex(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

@Component({
  selector: 'app-schedule-page',
  imports: [...SHARED_IMPORTS, ReactiveFormsModule, ConflictExplainerComponent],
  template: `
    <div class="page">
      <app-page-header title="schedule.title" subtitle="schedule.subtitle">
        @if (auth.has('schedule.write')) {
          <button type="button" class="btn btn-primary" [disabled]="!options()" (click)="openCreateSeries()">
            <app-icon name="calendar-plus" [size]="16" />
            {{ 'schedule.newSeries' | transloco }}
          </button>
        }
      </app-page-header>

      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class="btn btn-secondary btn-icon-sm"
            [attr.aria-label]="'schedule.previousWeek' | transloco"
            (click)="shiftWeek(-1)"
          >
            <app-icon name="chevron-left" [size]="16" />
          </button>
          <span class="min-w-[150px] px-1 text-center text-[13px] font-semibold text-ink">
            {{ 'schedule.weekOf' | transloco: { range: weekRange() } }}
          </span>
          <button
            type="button"
            class="btn btn-secondary btn-icon-sm"
            [attr.aria-label]="'schedule.nextWeek' | transloco"
            (click)="shiftWeek(1)"
          >
            <app-icon name="chevron-right" [size]="16" />
          </button>
          <button type="button" class="btn btn-secondary btn-sm ml-1" (click)="goToday()">
            {{ 'schedule.today' | transloco }}
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <select name="branch"
            class="select h-9 w-auto min-w-[150px]"
            [value]="branchId()"
            [attr.aria-label]="'schedule.filters.branch' | transloco"
            (change)="onFilterChange('branch', $event)"
          >
            <option value="">{{ 'common.allBranches' | transloco }}</option>
            @for (branch of options()?.branches ?? []; track branch.id) {
              <option [value]="branch.id">{{ branch.name }}</option>
            }
          </select>
          <select name="teacher"
            class="select h-9 w-auto min-w-[150px]"
            [value]="teacherId()"
            [attr.aria-label]="'schedule.filters.teacher' | transloco"
            (change)="onFilterChange('teacher', $event)"
          >
            <option value="">{{ 'common.allTeachers' | transloco }}</option>
            @for (teacher of options()?.teachers ?? []; track teacher.id) {
              <option [value]="teacher.id">{{ teacher.lastName }} {{ teacher.firstName }}</option>
            }
          </select>
          <select name="room"
            class="select h-9 w-auto min-w-[140px]"
            [value]="roomId()"
            [attr.aria-label]="'schedule.filters.room' | transloco"
            (change)="onFilterChange('room', $event)"
          >
            <option value="">{{ 'common.allRooms' | transloco }}</option>
            @for (room of options()?.rooms ?? []; track room.id) {
              <option [value]="room.id">{{ room.name }}</option>
            }
          </select>
        </div>
      </div>

      @if (loading()) {
        <div class="card p-4">
          <div class="skeleton h-[380px] w-full"></div>
        </div>
      } @else if (!lessons().length) {
        <div class="card">
          <app-empty-state title="schedule.empty" icon="calendar" />
        </div>
      } @else {
        <div class="hidden md:block">
          <div class="card overflow-hidden">
            <div class="scroll-x">
              <div class="min-w-[1020px]">
                <div
                  class="grid border-b border-line bg-surface-2"
                  style="grid-template-columns: 64px repeat(7, minmax(0, 1fr))"
                >
                  <div class="px-2 py-2.5"></div>
                  @for (day of days(); track day.key) {
                    <div
                      class="border-l border-line px-2 py-2 text-center"
                      [class.bg-accent-soft]="day.isToday"
                    >
                      <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                        {{ day.label }}
                      </p>
                      <p
                        class="text-[13px] font-semibold"
                        [class.text-accent-strong]="day.isToday"
                        [class.text-ink]="!day.isToday"
                      >
                        {{ day.dayNumber }}
                      </p>
                    </div>
                  }
                </div>

                <div class="grid" style="grid-template-columns: 64px repeat(7, minmax(0, 1fr))">
                  <div class="relative border-r border-line" [style.height.px]="gridHeight">
                    @for (hour of hourLabels; track hour) {
                      <span
                        class="absolute right-2 text-[10px] font-medium tabular-nums text-ink-3"
                        [style.top.px]="(hour - 8) * 64 + 2"
                      >
                        {{ padHour(hour) }}:00
                      </span>
                    }
                  </div>
                  @for (day of days(); track day.key) {
                    <div
                      class="relative border-r border-line last:border-r-0"
                      [class.bg-surface-2/40]="day.isToday"
                      [style.height.px]="gridHeight"
                      [style.backgroundImage]="hourLines"
                    >
                      @for (card of day.cards; track card.lesson.id) {
                        <button
                          type="button"
                          class="absolute inset-x-1 overflow-hidden rounded-lg border-y border-r border-l-[3px] border-line px-1.5 py-1 text-left shadow-sm transition hover:z-10 hover:shadow-pop"
                          [class.opacity-60]="card.cancelled"
                          [style.top.px]="card.top"
                          [style.height.px]="card.height"
                          [style.borderLeftColor]="card.color"
                          [style.backgroundColor]="card.tint"
                          (click)="openLesson(card.lesson)"
                        >
                          <span class="flex items-center justify-between gap-1">
                            <span class="text-[10px] font-semibold tabular-nums text-ink-3">
                              {{ format.time(card.lesson.startsAt) }}
                            </span>
                            <span
                              class="h-1.5 w-1.5 shrink-0 rounded-full"
                              [class.bg-success]="card.lesson.status === 'COMPLETED'"
                              [class.bg-danger]="card.lesson.status === 'CANCELLED'"
                              [class.bg-info]="card.lesson.status === 'SCHEDULED'"
                              [class.bg-warning]="card.lesson.status === 'RESCHEDULED'"
                            ></span>
                          </span>
                          <span
                            class="mt-0.5 line-clamp-2 block text-[11.5px] font-semibold leading-tight text-ink"
                            [class.line-through]="card.cancelled"
                          >
                            {{ card.lesson.title }}
                          </span>
                          <span class="mt-0.5 block truncate text-[10.5px] text-ink-3">
                            {{ card.lesson.room?.name || '—' }}
                          </span>
                          @if (isDirector()) {
                            <span class="block truncate text-[10px] text-ink-3">
                              {{ teacherName(card.lesson) }}
                            </span>
                          }
                          <span class="block truncate text-[10px] text-ink-3">
                            {{ studentCount(card.lesson) }} {{ 'common.students' | transloco }}
                          </span>
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="md:hidden">
          @for (day of days(); track day.key) {
            <section class="card mb-3 overflow-hidden">
              <header class="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2.5">
                <div class="flex items-baseline gap-2">
                  <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    {{ day.label }}
                  </span>
                  <span class="text-[14px] font-semibold text-ink">{{ day.dayNumber }}</span>
                </div>
                @if (day.isToday) {
                  <span class="badge badge-accent">{{ 'common.today' | transloco }}</span>
                }
              </header>
              <div class="space-y-2 p-3">
                @if (!day.lessons.length) {
                  <p class="py-1 text-center text-[12px] text-ink-3">
                    {{ 'schedule.noLessonsDay' | transloco }}
                  </p>
                } @else {
                  @for (lesson of day.lessons; track lesson.id) {
                    <button
                      type="button"
                      class="flex w-full items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition hover:bg-surface-2"
                      [class.opacity-60]="lesson.status === 'CANCELLED'"
                      (click)="openLesson(lesson)"
                    >
                      <span class="w-11 shrink-0 text-right">
                        <span class="block text-[12px] font-semibold tabular-nums text-ink-2">
                          {{ format.time(lesson.startsAt) }}
                        </span>
                        <span class="block text-[10.5px] text-ink-3">
                          {{ format.time(lesson.endsAt) }}
                        </span>
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="flex items-center gap-1.5">
                          <span
                            class="h-1.5 w-1.5 shrink-0 rounded-full"
                            [class.bg-success]="lesson.status === 'COMPLETED'"
                            [class.bg-danger]="lesson.status === 'CANCELLED'"
                            [class.bg-info]="lesson.status === 'SCHEDULED'"
                            [class.bg-warning]="lesson.status === 'RESCHEDULED'"
                          ></span>
                          <span
                            class="truncate text-[13px] font-semibold text-ink"
                            [class.line-through]="lesson.status === 'CANCELLED'"
                          >
                            {{ lesson.title }}
                          </span>
                        </span>
                        <span class="mt-0.5 block truncate text-[11.5px] text-ink-3">
                          {{ lesson.room?.name || '—' }}
                        </span>
                      </span>
                      <app-status-badge [status]="lesson.status" />
                    </button>
                  }
                }
              </div>
            </section>
          }
        </div>
      }
    </div>

    <app-drawer
      [open]="lessonOpen()"
      [title]="lessonDrawerTitle()"
      [translateTitle]="false"
      size="lg"
      [showFooter]="true"
      (closed)="closeLesson()"
    >
      @if (lessonLoading()) {
        <div class="space-y-3">
          <div class="skeleton h-6 w-2/3"></div>
          <div class="skeleton h-4 w-1/3"></div>
          <div class="skeleton h-24 w-full"></div>
          <div class="skeleton h-24 w-full"></div>
        </div>
      } @else if (selectedLesson(); as lesson) {
        <div class="space-y-5">
          <div class="flex flex-wrap items-center gap-1.5">
            <app-status-badge [status]="lesson.status" />
            <span class="badge badge-neutral">{{ ('lessonType.' + lesson.type) | transloco }}</span>
            @if (lesson.lessonSeries?.program; as program) {
              <span class="badge badge-neutral">{{ program.name }}</span>
            }
            @if (lesson.lessonSeries?.level; as level) {
              <span class="badge badge-neutral">{{ level.name }}</span>
            }
          </div>

          @if (lesson.cancellationReason) {
            <div class="alert alert-danger">
              <app-icon name="alert" [size]="16" />
              <span>{{ lesson.cancellationReason }}</span>
            </div>
          }

          <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt class="field-label">{{ 'common.date' | transloco }}</dt>
              <dd class="mt-0.5 text-[13px] text-ink">{{ format.date(lesson.startsAt, 'long') }}</dd>
            </div>
            <div>
              <dt class="field-label">{{ 'schedule.lesson.time' | transloco }}</dt>
              <dd class="mt-0.5 text-[13px] text-ink">
                {{ format.timeRange(lesson.startsAt, lesson.endsAt) }}
                <span class="text-ink-3">
                  · {{ 'schedule.lesson.duration' | transloco: { minutes: durationMinutes(lesson) } }}
                </span>
              </dd>
            </div>
            <div>
              <dt class="field-label">{{ 'schedule.lesson.teacher' | transloco }}</dt>
              <dd class="mt-0.5 text-[13px] text-ink">{{ teacherName(lesson) }}</dd>
            </div>
            <div>
              <dt class="field-label">{{ 'schedule.lesson.room' | transloco }}</dt>
              <dd class="mt-0.5 text-[13px] text-ink">{{ lesson.room?.name || '—' }}</dd>
            </div>
            <div>
              <dt class="field-label">{{ 'schedule.filters.branch' | transloco }}</dt>
              <dd class="mt-0.5 text-[13px] text-ink">{{ lesson.branch?.name || '—' }}</dd>
            </div>
            <div>
              <dt class="field-label">{{ 'common.type' | transloco }}</dt>
              <dd class="mt-0.5 text-[13px] text-ink">
                {{ ('lessonType.' + lesson.type) | transloco }}
              </dd>
            </div>
          </dl>

          @if (canOpenAttendance()) {
            <a
              class="btn btn-secondary w-full"
              [routerLink]="['/app/attendance']"
              [queryParams]="{ date: attendanceDate(lesson), lessonId: lesson.id }"
            >
              <app-icon name="check-circle" [size]="16" />
              {{ 'schedule.lesson.openAttendance' | transloco }}
            </a>
          }

          <section>
            <h3 class="eyebrow mb-2">{{ 'schedule.lesson.students' | transloco }}</h3>
            <div class="space-y-1.5">
              @for (row of lesson.students ?? []; track row.studentId) {
                <div class="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                  <div class="flex min-w-0 items-center gap-2">
                    <app-avatar
                      [firstName]="row.student?.firstName ?? ''"
                      [lastName]="row.student?.lastName ?? ''"
                      [size]="28"
                    />
                    <div class="min-w-0">
                      <p class="truncate text-[12.5px] font-medium text-ink">
                        {{ row.student?.firstName }} {{ row.student?.lastName }}
                      </p>
                      @if (row.student?.registrationNumber) {
                        <p class="text-[10.5px] text-ink-3">{{ row.student?.registrationNumber }}</p>
                      }
                    </div>
                  </div>
                  @if (attendanceStatus(row.studentId); as status) {
                    <app-status-badge [status]="status" />
                  }
                </div>
              } @empty {
                <p class="text-[12.5px] text-ink-3">{{ 'schedule.lesson.noStudents' | transloco }}</p>
              }
            </div>
          </section>

          <section>
            <h3 class="eyebrow mb-2">{{ 'schedule.lesson.notes' | transloco }}</h3>
            <div class="space-y-2">
              @for (note of lesson.notes; track note.id) {
                <div class="rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[12px] font-semibold text-ink">
                      {{ note.author.firstName }} {{ note.author.lastName }}
                    </span>
                    <span class="text-[10.5px] text-ink-3">{{ format.timeAgo(note.createdAt) }}</span>
                  </div>
                  <p class="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-2">
                    {{ note.content }}
                  </p>
                </div>
              } @empty {
                <p class="text-[12.5px] text-ink-3">{{ 'schedule.lesson.noNotes' | transloco }}</p>
              }
            </div>

            @if (auth.has('attendance.write')) {
              <form [formGroup]="noteForm" class="mt-3 space-y-2" (ngSubmit)="addNote()">
                <textarea name="content"
                  class="textarea min-h-20"
                  formControlName="content"
                  maxlength="2000"
                  [placeholder]="'schedule.lesson.notePlaceholder' | transloco"
                ></textarea>
                <div class="flex justify-end">
                  <button
                    type="submit"
                    class="btn btn-secondary btn-sm"
                    [disabled]="noteSaving() || noteForm.invalid"
                  >
                    <app-icon name="plus" [size]="14" />
                    {{ 'schedule.lesson.addNote' | transloco }}
                  </button>
                </div>
              </form>
            }
          </section>
        </div>
      }

      <div drawer-footer class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap gap-2">
          @if (canEditSeries()) {
            <button type="button" class="btn btn-secondary btn-sm" (click)="editSeriesFromLesson()">
              <app-icon name="pencil" [size]="14" />
              {{ 'schedule.seriesDrawer.edit' | transloco }}
            </button>
          }
        </div>
        <div class="flex flex-wrap gap-2">
          @if (canManageLesson()) {
            <button type="button" class="btn btn-secondary" (click)="openReschedule()">
              {{ 'schedule.lesson.reschedule' | transloco }}
            </button>
            <button type="button" class="btn btn-danger-soft" (click)="openCancel()">
              {{ 'schedule.lesson.cancel' | transloco }}
            </button>
          }
        </div>
      </div>
    </app-drawer>

    <app-drawer
      [open]="rescheduleOpen()"
      title="schedule.reschedule.title"
      [showFooter]="true"
      (closed)="closeReschedule()"
    >
      <p class="mb-4 text-[13px] leading-relaxed text-ink-2">
        {{ 'schedule.reschedule.message' | transloco }}
      </p>
      <form [formGroup]="rescheduleForm" class="space-y-4">
        <label class="field">
          <span class="field-label">{{ 'schedule.reschedule.startsAt' | transloco }}</span>
          <input name="startsAt" class="input" type="datetime-local" formControlName="startsAt" autocomplete="off" />
        </label>
        <label class="field">
          <span class="field-label">{{ 'schedule.reschedule.room' | transloco }}</span>
          <select name="roomId" class="select" formControlName="roomId">
            <option value="">—</option>
            @for (room of rescheduleRooms(); track room.id) {
              <option [value]="room.id">{{ room.name }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span class="field-label">{{ 'schedule.reschedule.reason' | transloco }}</span>
          <textarea name="reason" class="textarea" formControlName="reason" maxlength="300"></textarea>
        </label>
      </form>
      <div drawer-footer class="flex items-center justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="closeReschedule()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          [disabled]="rescheduleSaving()"
          (click)="saveReschedule()"
        >
          {{ (rescheduleSaving() ? 'common.saving' : 'common.save') | transloco }}
        </button>
      </div>
    </app-drawer>

    <app-drawer
      [open]="cancelOpen()"
      title="schedule.cancel.title"
      [showFooter]="true"
      (closed)="closeCancel()"
    >
      <p class="mb-4 text-[13px] leading-relaxed text-ink-2">
        {{ 'schedule.cancel.message' | transloco }}
      </p>
      <form [formGroup]="cancelForm" class="space-y-2">
        <label class="field">
          <span class="field-label">{{ 'schedule.cancel.reason' | transloco }}</span>
          <textarea name="reason" class="textarea" formControlName="reason" maxlength="300"></textarea>
          @if (cancelForm.controls.reason.touched && cancelForm.controls.reason.invalid) {
            <span class="field-error">{{ 'schedule.cancel.reasonRequired' | transloco }}</span>
          }
        </label>
      </form>
      <div drawer-footer class="flex items-center justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="closeCancel()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="button"
          class="btn btn-danger"
          [disabled]="cancelSaving()"
          (click)="saveCancel()"
        >
          {{ (cancelSaving() ? 'common.saving' : 'schedule.lesson.cancel') | transloco }}
        </button>
      </div>
    </app-drawer>

    <app-drawer
      [open]="seriesOpen()"
      [title]="seriesEditingId() ? 'schedule.form.editTitle' : 'schedule.form.createTitle'"
      size="lg"
      [showFooter]="true"
      (closed)="closeSeries()"
    >
      @if (seriesLoading()) {
        <div class="space-y-3">
          <div class="skeleton h-10 w-full"></div>
          <div class="skeleton h-10 w-full"></div>
          <div class="skeleton h-10 w-2/3"></div>
          <div class="skeleton h-24 w-full"></div>
        </div>
      } @else {
        @if (seriesFormError()) {
          <div class="alert alert-danger mb-4">
            <app-icon name="alert" [size]="16" />
            <span>{{ seriesFormError() }}</span>
          </div>
        }

        <form [formGroup]="seriesForm" class="space-y-4" (ngSubmit)="saveSeries()">
          <label class="field">
            <span class="field-label">{{ 'schedule.form.title' | transloco }}</span>
            <input name="title" class="input" formControlName="title" maxlength="120" autocomplete="off" />
            @if (seriesForm.controls.title.touched && seriesForm.controls.title.invalid) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>

          <div class="grid grid-cols-2 gap-3">
            <label class="field">
              <span class="field-label">{{ 'schedule.form.program' | transloco }}</span>
              <select name="programId" class="select" formControlName="programId">
                <option value="">—</option>
                @for (program of options()?.programs ?? []; track program.id) {
                  <option [value]="program.id">{{ program.name }}</option>
                }
              </select>
              @if (seriesForm.controls.programId.touched && seriesForm.controls.programId.invalid) {
                <span class="field-error">{{ 'common.required' | transloco }}</span>
              }
            </label>
            <label class="field">
              <span class="field-label">
                {{ 'schedule.form.level' | transloco }}
                <span class="font-normal text-ink-3">({{ 'common.optional' | transloco }})</span>
              </span>
              <select name="levelId" class="select" formControlName="levelId">
                <option value="">—</option>
                @for (level of options()?.levels ?? []; track level.id) {
                  <option [value]="level.id">{{ level.name }}</option>
                }
              </select>
            </label>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="field">
              <span class="field-label">{{ 'schedule.form.type' | transloco }}</span>
              <select name="type" class="select" formControlName="type">
                @for (type of lessonTypes; track type) {
                  <option [ngValue]="type">{{ ('lessonType.' + type) | transloco }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span class="field-label">{{ 'schedule.form.branch' | transloco }}</span>
              <select name="branchId" class="select" formControlName="branchId" (change)="onSeriesBranchChange()">
                <option value="">—</option>
                @for (branch of options()?.branches ?? []; track branch.id) {
                  <option [value]="branch.id">{{ branch.name }}</option>
                }
              </select>
            </label>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="field">
              <span class="field-label">{{ 'schedule.form.room' | transloco }}</span>
              <select name="roomId" class="select" formControlName="roomId">
                <option value="">—</option>
                @for (room of roomsForBranch(seriesForm.controls.branchId.value); track room.id) {
                  <option [value]="room.id">{{ room.name }}</option>
                }
              </select>
              @if (seriesForm.controls.roomId.touched && seriesForm.controls.roomId.invalid) {
                <span class="field-error">{{ 'common.required' | transloco }}</span>
              }
            </label>
            <label class="field">
              <span class="field-label">{{ 'schedule.form.teacher' | transloco }}</span>
              <select name="teacherId" class="select" formControlName="teacherId">
                <option value="">—</option>
                @for (teacher of options()?.teachers ?? []; track teacher.id) {
                  <option [value]="teacher.id">{{ teacher.lastName }} {{ teacher.firstName }}</option>
                }
              </select>
            </label>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="field">
              <span class="field-label">{{ 'schedule.form.weekday' | transloco }}</span>
              <select name="weekday" class="select" formControlName="weekday">
                @for (day of weekdays; track day) {
                  <option [ngValue]="day">{{ ('weekday.' + day) | transloco }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span class="field-label">{{ 'schedule.form.startTime' | transloco }}</span>
              <input name="startTime" class="input" type="time" formControlName="startTime" autocomplete="off" />
            </label>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="field">
              <span class="field-label">{{ 'schedule.form.duration' | transloco }}</span>
              <select name="durationMinutes" class="select" formControlName="durationMinutes">
                @for (duration of durations; track duration) {
                  <option [ngValue]="duration">{{ duration }} {{ 'common.minutes' | transloco }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span class="field-label">{{ 'common.status' | transloco }}</span>
              <select name="status" class="select" formControlName="status">
                @for (status of seriesStatuses; track status) {
                  <option [ngValue]="status">{{ ('status.' + status) | transloco }}</option>
                }
              </select>
            </label>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="field">
              <span class="field-label">{{ 'schedule.form.validFrom' | transloco }}</span>
              <input name="validFrom" class="input" type="date" formControlName="validFrom" autocomplete="off" />
            </label>
            <label class="field">
              <span class="field-label">{{ 'schedule.form.validTo' | transloco }}</span>
              <input name="validTo" class="input" type="date" formControlName="validTo" autocomplete="off" />
            </label>
          </div>

          <div class="field">
            <span class="field-label">{{ 'schedule.form.students' | transloco }}</span>
            <p class="field-hint">{{ 'schedule.form.studentsHint' | transloco }}</p>
            <input name="studentSearch"
              class="input"
              [value]="studentQuery()"
              [placeholder]="'schedule.form.searchStudents' | transloco"
              autocomplete="off"
              (input)="onStudentSearchInput($event)"
              (keydown.enter)="onStudentSearchSubmit($event)"
            />
            @if (searchingStudents()) {
              <span class="field-hint">{{ 'common.loading' | transloco }}</span>
            }
            @if (studentResults().length) {
              <div class="max-h-40 overflow-y-auto rounded-xl border border-line">
                @for (student of studentResults(); track student.id) {
                  <button type="button" class="menu-item" (click)="addStudent(student)">
                    <app-icon name="plus" [size]="13" />
                    <span class="min-w-0 flex-1 truncate">
                      {{ student.lastName }} {{ student.firstName }}
                    </span>
                    @if (student.registrationNumber) {
                      <span class="text-[10.5px] text-ink-3">{{ student.registrationNumber }}</span>
                    }
                  </button>
                }
              </div>
            }
            <div class="mt-1 flex flex-wrap gap-1.5">
              @for (student of selectedStudents(); track student.id) {
                <span class="badge badge-neutral gap-1 py-1 pl-2 pr-1">
                  {{ student.lastName }} {{ student.firstName }}
                  <button
                    type="button"
                    class="rounded p-0.5 hover:bg-surface-3"
                    [attr.aria-label]="'common.remove' | transloco"
                    (click)="removeStudent(student.id)"
                  >
                    <app-icon name="x" [size]="11" />
                  </button>
                </span>
              } @empty {
                <span class="text-[11.5px] text-ink-3">
                  {{ 'schedule.form.noStudentsSelected' | transloco }}
                </span>
              }
            </div>
          </div>

          <app-conflict-explainer
            [teacherId]="seriesForm.controls.teacherId.value"
            [roomId]="seriesForm.controls.roomId.value"
            [startTime]="seriesForm.controls.startTime.value"
            [durationMinutes]="seriesForm.controls.durationMinutes.value"
            (slotApplied)="onConflictSlotApplied($event)"
          />
        </form>
      }

      <div drawer-footer class="flex items-center justify-between gap-2">
        <div>
          @if (seriesEditingId()) {
            <button
              type="button"
              class="btn btn-danger-soft"
              [disabled]="seriesDeleting()"
              (click)="deleteSeries()"
            >
              <app-icon name="trash" [size]="15" />
              {{ 'schedule.seriesDrawer.delete' | transloco }}
            </button>
          }
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="btn btn-secondary" (click)="closeSeries()">
            {{ 'common.cancel' | transloco }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="seriesSaving() || seriesLoading()"
            (click)="saveSeries()"
          >
            {{ (seriesSaving() ? 'common.saving' : 'common.save') | transloco }}
          </button>
        </div>
      </div>
    </app-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePage {
  onConflictSlotApplied(event: { startTime: string }): void {
    this.seriesForm.controls.startTime.setValue(event.startTime);
  }
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  protected readonly format = inject(FormatService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly transloco = inject(TranslocoService);

  protected readonly options = signal<ScheduleOptions | null>(null);
  protected readonly lessons = signal<Lesson[]>([]);
  protected readonly loading = signal(true);
  protected readonly weekStart = signal(startOfWeekKey(todayKey()));
  protected readonly branchId = signal('');
  protected readonly teacherId = signal('');
  protected readonly roomId = signal('');

  protected readonly lessonOpen = signal(false);
  protected readonly lessonLoading = signal(false);
  protected readonly selectedLesson = signal<LessonDetail | null>(null);

  protected readonly rescheduleOpen = signal(false);
  protected readonly rescheduleSaving = signal(false);
  protected readonly cancelOpen = signal(false);
  protected readonly cancelSaving = signal(false);
  protected readonly noteSaving = signal(false);

  protected readonly seriesOpen = signal(false);
  protected readonly seriesLoading = signal(false);
  protected readonly seriesSaving = signal(false);
  protected readonly seriesDeleting = signal(false);
  protected readonly seriesEditingId = signal<string | null>(null);
  protected readonly seriesFormError = signal<string | null>(null);
  protected readonly selectedStudents = signal<StudentRef[]>([]);
  protected readonly studentResults = signal<StudentRef[]>([]);
  protected readonly studentQuery = signal('');
  protected readonly searchingStudents = signal(false);

  protected readonly hourLabels = Array.from(
    { length: GRID_END_HOUR - GRID_START_HOUR },
    (_, index) => index + GRID_START_HOUR,
  );
  protected readonly gridHeight = GRID_HEIGHT;
  protected readonly hourLines =
    'repeating-linear-gradient(to bottom, var(--line) 0px, var(--line) 1px, transparent 1px, transparent 64px)';
  protected readonly lessonTypes: LessonType[] = ['INDIVIDUAL', 'GROUP', 'ENSEMBLE'];
  protected readonly seriesStatuses: SeriesStatus[] = ['ACTIVE', 'PAUSED', 'ENDED'];
  protected readonly weekdays = [1, 2, 3, 4, 5, 6, 7];
  protected readonly durations = [30, 45, 60, 90];

  protected readonly noteForm = this.fb.nonNullable.group({
    content: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  protected readonly rescheduleForm = this.fb.nonNullable.group({
    startsAt: ['', Validators.required],
    roomId: [''],
    reason: ['', [Validators.maxLength(300)]],
  });

  protected readonly cancelForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(300)]],
  });

  protected readonly seriesForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    programId: ['', Validators.required],
    levelId: [''],
    type: this.fb.nonNullable.control<LessonType>('INDIVIDUAL'),
    branchId: ['', Validators.required],
    roomId: ['', Validators.required],
    teacherId: ['', Validators.required],
    weekday: this.fb.nonNullable.control(1, [Validators.required, Validators.min(1), Validators.max(7)]),
    startTime: ['17:00', Validators.required],
    durationMinutes: this.fb.nonNullable.control(45, [
      Validators.required,
      Validators.min(15),
      Validators.max(240),
    ]),
    validFrom: [todayKey(), Validators.required],
    validTo: [''],
    status: this.fb.nonNullable.control<SeriesStatus>('ACTIVE'),
  });

  private requestId = 0;
  private lessonRequestId = 0;
  private studentSearchId = 0;
  private searchTimer = 0;

  protected readonly weekRange = computed(() => {
    const start = this.weekStart();
    const end = addDaysKey(start, 6);
    if (start.slice(0, 7) === end.slice(0, 7)) {
      return `${Number(start.slice(8))}–${Number(end.slice(8))} ${this.format.monthLabel(end.slice(0, 7))}`;
    }
    return `${this.format.date(start, 'dayMonth')} – ${this.format.date(end, 'dayMonth')}`;
  });

  protected readonly days = computed<ScheduleDay[]>(() => {
    const names = this.format.weekdayNames('short');
    const grouped = new Map<string, Lesson[]>();
    for (const lesson of this.lessons()) {
      const key = athensDateKey(lesson.startsAt);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(lesson);
      else grouped.set(key, [lesson]);
    }
    const today = todayKey();
    return weekDayKeys(this.weekStart()).map((key) => {
      const weekday = weekdayNumber(key);
      const lessons = (grouped.get(key) ?? [])
        .slice()
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
      return {
        key,
        weekday,
        label: names[weekday - 1] ?? '',
        dayNumber: Number(key.slice(8)),
        isToday: key === today,
        lessons,
        cards: lessons.map((lesson) => this.toCard(lesson)),
      };
    });
  });

  protected readonly isDirector = computed(() => this.auth.role() === 'DIRECTOR');

  protected readonly canOpenAttendance = computed(
    () => this.auth.has('attendance.write') && this.selectedLesson()?.status !== 'CANCELLED',
  );

  protected readonly canManageLesson = computed(
    () => this.auth.has('schedule.write') && this.selectedLesson()?.status !== 'CANCELLED',
  );

  protected readonly canEditSeries = computed(
    () => this.auth.has('schedule.write') && Boolean(this.selectedLesson()?.lessonSeriesId),
  );

  protected readonly lessonDrawerTitle = computed(
    () => this.selectedLesson()?.title ?? this.transloco.translate('schedule.title'),
  );

  protected readonly rescheduleRooms = computed<Room[]>(() =>
    this.roomsForBranch(this.selectedLesson()?.branchId ?? ''),
  );

  constructor() {
    void this.bootstrap();
  }

  protected shiftWeek(direction: number): void {
    this.weekStart.update((key) => addDaysKey(key, direction * 7));
    void this.loadWeek();
  }

  protected goToday(): void {
    this.weekStart.set(startOfWeekKey(todayKey()));
    void this.loadWeek();
  }

  protected onFilterChange(kind: 'branch' | 'teacher' | 'room', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (kind === 'branch') this.branchId.set(value);
    else if (kind === 'teacher') this.teacherId.set(value);
    else this.roomId.set(value);
    void this.loadWeek();
  }

  protected padHour(hour: number): string {
    return String(hour).padStart(2, '0');
  }

  protected teacherName(lesson: Lesson): string {
    return lesson.teacher ? `${lesson.teacher.firstName} ${lesson.teacher.lastName}` : '—';
  }

  protected studentCount(lesson: Lesson): number {
    return lesson.students?.length ?? lesson._count?.students ?? 0;
  }

  protected durationMinutes(lesson: Lesson): number {
    return Math.round(
      (new Date(lesson.endsAt).getTime() - new Date(lesson.startsAt).getTime()) / 60_000,
    );
  }

  protected attendanceDate(lesson: Lesson): string {
    return athensDateKey(lesson.startsAt);
  }

  protected attendanceStatus(studentId: string): string | null {
    return (
      this.selectedLesson()?.attendances?.find((row) => row.studentId === studentId)?.status ?? null
    );
  }

  protected roomsForBranch(branchId: string): Room[] {
    const rooms = this.options()?.rooms ?? [];
    return branchId ? rooms.filter((room) => room.branchId === branchId) : rooms;
  }

  protected async openLesson(lesson: Lesson): Promise<void> {
    const request = ++this.lessonRequestId;
    this.lessonOpen.set(true);
    this.selectedLesson.set(null);
    this.lessonLoading.set(true);
    try {
      const detail = await firstValueFrom(this.api.get<LessonDetail>(`/lessons/${lesson.id}`));
      if (request !== this.lessonRequestId) return;
      this.selectedLesson.set(detail);
      this.noteForm.reset({ content: '' });
    } catch {
      if (request === this.lessonRequestId) this.lessonOpen.set(false);
    } finally {
      if (request === this.lessonRequestId) this.lessonLoading.set(false);
    }
  }

  protected closeLesson(): void {
    this.lessonOpen.set(false);
    this.selectedLesson.set(null);
    this.lessonRequestId += 1;
  }

  protected async addNote(): Promise<void> {
    const lesson = this.selectedLesson();
    if (!lesson || this.noteForm.invalid) {
      this.noteForm.markAllAsTouched();
      return;
    }
    const content = this.noteForm.controls.content.value.trim();
    if (!content) {
      this.noteForm.controls.content.setValue('');
      this.noteForm.controls.content.markAsTouched();
      return;
    }

    this.noteSaving.set(true);
    try {
      await firstValueFrom(this.api.post(`/lessons/${lesson.id}/notes`, { content }));
      this.toast.success(this.transloco.translate('schedule.lesson.noteSaved'));
      this.noteForm.reset({ content: '' });
      await Promise.all([this.loadLesson(lesson.id), this.loadWeek()]);
    } catch {
      // Errors are surfaced globally by the HTTP interceptor.
    } finally {
      this.noteSaving.set(false);
    }
  }

  protected openReschedule(): void {
    const lesson = this.selectedLesson();
    if (!lesson) return;
    this.rescheduleForm.reset({
      startsAt: `${athensDateKey(lesson.startsAt)}T${athensTimeKey(lesson.startsAt)}`,
      roomId: lesson.roomId,
      reason: '',
    });
    this.lessonOpen.set(false);
    this.rescheduleOpen.set(true);
  }

  protected closeReschedule(): void {
    this.rescheduleOpen.set(false);
    this.selectedLesson.set(null);
  }

  protected async saveReschedule(): Promise<void> {
    const lesson = this.selectedLesson();
    if (!lesson) return;
    if (this.rescheduleForm.invalid) {
      this.rescheduleForm.markAllAsTouched();
      return;
    }
    const value = this.rescheduleForm.getRawValue();
    const local = value.startsAt;
    if (local.length < 16) {
      this.rescheduleForm.controls.startsAt.markAsTouched();
      return;
    }
    const startsAt = athensDateTime(local.slice(0, 10), local.slice(11, 16)).toISOString();

    this.rescheduleSaving.set(true);
    try {
      await firstValueFrom(
        this.api.patch(`/lessons/${lesson.id}/reschedule`, {
          startsAt,
          roomId: value.roomId || undefined,
          reason: value.reason.trim() || undefined,
        }),
      );
      this.toast.success(this.transloco.translate('schedule.reschedule.saved'));
      this.closeReschedule();
      await this.loadWeek();
    } catch {
      // Errors are surfaced globally by the HTTP interceptor.
    } finally {
      this.rescheduleSaving.set(false);
    }
  }

  protected openCancel(): void {
    this.cancelForm.reset({ reason: '' });
    this.lessonOpen.set(false);
    this.cancelOpen.set(true);
  }

  protected closeCancel(): void {
    this.cancelOpen.set(false);
    this.selectedLesson.set(null);
  }

  protected async saveCancel(): Promise<void> {
    const lesson = this.selectedLesson();
    if (!lesson) return;
    if (this.cancelForm.invalid) {
      this.cancelForm.markAllAsTouched();
      return;
    }
    const reason = this.cancelForm.controls.reason.value.trim();
    if (!reason) {
      this.cancelForm.controls.reason.setValue('');
      this.cancelForm.controls.reason.markAsTouched();
      return;
    }

    this.cancelSaving.set(true);
    try {
      await firstValueFrom(this.api.patch(`/lessons/${lesson.id}/cancel`, { reason }));
      this.toast.success(this.transloco.translate('schedule.lesson.cancelled'));
      this.closeCancel();
      await this.loadWeek();
    } catch {
      // Errors are surfaced globally by the HTTP interceptor.
    } finally {
      this.cancelSaving.set(false);
    }
  }

  protected openCreateSeries(): void {
    if (!this.auth.has('schedule.write')) return;
    const options = this.options();
    if (!options) return;

    const branchId = options.branches[0]?.id ?? '';
    const rooms = this.roomsForBranch(branchId);
    this.seriesEditingId.set(null);
    this.seriesFormError.set(null);
    this.selectedStudents.set([]);
    this.studentQuery.set('');
    this.studentResults.set([]);
    this.seriesForm.reset({
      title: '',
      programId: options.programs[0]?.id ?? '',
      levelId: '',
      type: 'INDIVIDUAL',
      branchId,
      roomId: rooms[0]?.id ?? '',
      teacherId: options.teachers[0]?.id ?? '',
      weekday: weekdayNumber(todayKey()),
      startTime: '17:00',
      durationMinutes: 45,
      validFrom: todayKey(),
      validTo: '',
      status: 'ACTIVE',
    });
    this.seriesOpen.set(true);
    void this.searchStudents();
  }

  protected async openEditSeries(seriesId: string): Promise<void> {
    if (!this.auth.has('schedule.write')) return;
    this.seriesEditingId.set(seriesId);
    this.seriesFormError.set(null);
    this.selectedStudents.set([]);
    this.studentQuery.set('');
    this.studentResults.set([]);
    this.seriesOpen.set(true);
    this.seriesLoading.set(true);
    try {
      const series = await firstValueFrom(this.api.get<LessonSeries>(`/lesson-series/${seriesId}`));
      this.seriesForm.reset({
        title: series.title,
        programId: series.programId,
        levelId: series.levelId ?? '',
        type: series.type,
        branchId: series.branchId,
        roomId: series.roomId,
        teacherId: series.teacherId,
        weekday: series.weekday,
        startTime: series.startTime,
        durationMinutes: series.durationMinutes,
        validFrom: series.validFrom.slice(0, 10),
        validTo: series.validTo ? series.validTo.slice(0, 10) : '',
        status: series.status,
      });
      this.selectedStudents.set((series.students ?? []).map((row) => row.student));
      void this.searchStudents();
    } catch {
      this.seriesOpen.set(false);
      this.seriesEditingId.set(null);
    } finally {
      this.seriesLoading.set(false);
    }
  }

  protected editSeriesFromLesson(): void {
    const seriesId = this.selectedLesson()?.lessonSeriesId;
    if (!seriesId) return;
    this.lessonOpen.set(false);
    void this.openEditSeries(seriesId);
  }

  protected closeSeries(): void {
    this.seriesOpen.set(false);
    this.seriesEditingId.set(null);
    this.seriesFormError.set(null);
    this.selectedStudents.set([]);
    this.studentResults.set([]);
    this.studentQuery.set('');
  }

  protected onSeriesBranchChange(): void {
    const branchId = this.seriesForm.controls.branchId.value;
    const rooms = this.roomsForBranch(branchId);
    const current = this.seriesForm.controls.roomId.value;
    if (!rooms.some((room) => room.id === current)) {
      this.seriesForm.controls.roomId.setValue(rooms[0]?.id ?? '');
    }
  }

  protected async saveSeries(): Promise<void> {
    const id = this.seriesEditingId();
    this.seriesFormError.set(null);
    if (this.seriesForm.invalid) {
      this.seriesForm.markAllAsTouched();
      return;
    }
    const value = this.seriesForm.getRawValue();
    if (!value.title.trim()) {
      this.seriesForm.controls.title.setValue('');
      this.seriesForm.controls.title.markAsTouched();
      return;
    }

    const payload: Record<string, unknown> = {
      title: value.title.trim(),
      programId: value.programId,
      levelId: value.levelId || (id ? null : undefined),
      type: value.type,
      branchId: value.branchId,
      roomId: value.roomId,
      teacherId: value.teacherId,
      weekday: Number(value.weekday),
      startTime: value.startTime,
      durationMinutes: Number(value.durationMinutes),
      validFrom: value.validFrom,
      validTo: value.validTo || (id ? null : undefined),
      status: value.status,
      studentIds: this.selectedStudents().map((student) => student.id),
    };

    this.seriesSaving.set(true);
    try {
      if (id) {
        await firstValueFrom(this.api.patch(`/lesson-series/${id}`, payload));
      } else {
        await firstValueFrom(this.api.post('/lesson-series', payload));
      }
      this.toast.success(
        this.transloco.translate(id ? 'schedule.form.saved' : 'schedule.form.created'),
      );
      this.closeSeries();
      await this.loadWeek();
    } catch (error) {
      const message = this.errorMessage(error);
      this.seriesFormError.set(message);
      this.toast.error(message);
    } finally {
      this.seriesSaving.set(false);
    }
  }

  protected async deleteSeries(): Promise<void> {
    const id = this.seriesEditingId();
    if (!id) return;
    const confirmed = await this.confirm.confirm({
      title: this.transloco.translate('schedule.form.deleteTitle'),
      message: this.transloco.translate('schedule.form.deleteMessage'),
      confirmLabel: this.transloco.translate('common.delete'),
      cancelLabel: this.transloco.translate('common.cancel'),
      danger: true,
    });
    if (!confirmed) return;

    this.seriesDeleting.set(true);
    try {
      await firstValueFrom(this.api.delete(`/lesson-series/${id}`));
      this.toast.success(this.transloco.translate('common.deleted'));
      this.closeSeries();
      await this.loadWeek();
    } catch {
      // Errors are surfaced globally by the HTTP interceptor.
    } finally {
      this.seriesDeleting.set(false);
    }
  }

  protected onStudentSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.studentQuery.set(value);
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => {
      void this.searchStudents();
    }, 280);
  }

  protected onStudentSearchSubmit(event: Event): void {
    event.preventDefault();
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    void this.searchStudents();
  }

  protected async searchStudents(): Promise<void> {
    const request = ++this.studentSearchId;
    this.searchingStudents.set(true);
    try {
      const response = await firstValueFrom(
        this.api.list<Student>('/students', { pageSize: 100, search: this.studentQuery().trim() }),
      );
      if (request !== this.studentSearchId) return;
      const selected = new Set(this.selectedStudents().map((student) => student.id));
      this.studentResults.set(
        response.data
          .filter((student) => !selected.has(student.id))
          .map((student) => ({
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            registrationNumber: student.registrationNumber,
          })),
      );
    } catch {
      if (request === this.studentSearchId) this.studentResults.set([]);
    } finally {
      if (request === this.studentSearchId) this.searchingStudents.set(false);
    }
  }

  protected addStudent(student: StudentRef): void {
    if (this.selectedStudents().some((selected) => selected.id === student.id)) return;
    this.selectedStudents.update((students) => [...students, student]);
    this.studentResults.update((students) => students.filter((item) => item.id !== student.id));
  }

  protected removeStudent(studentId: string): void {
    this.selectedStudents.update((students) => students.filter((item) => item.id !== studentId));
  }

  private async bootstrap(): Promise<void> {
    try {
      const options = await firstValueFrom(this.api.get<ScheduleOptions>('/schedule/options'));
      this.options.set(options);
    } catch {
      // Errors are surfaced globally by the HTTP interceptor.
    }
    await this.loadWeek();
  }

  private async loadWeek(): Promise<void> {
    const request = ++this.requestId;
    this.loading.set(true);
    try {
      const from = this.weekStart();
      const response = await firstValueFrom(
        this.api.list<Lesson>('/lessons', {
          from,
          to: addDaysKey(from, 6),
          branchId: this.branchId(),
          teacherId: this.teacherId(),
          roomId: this.roomId(),
        }),
      );
      if (request !== this.requestId) return;
      this.lessons.set(response.data);
    } catch {
      if (request === this.requestId) this.lessons.set([]);
    } finally {
      if (request === this.requestId) this.loading.set(false);
    }
  }

  private async loadLesson(lessonId: string): Promise<void> {
    const request = ++this.lessonRequestId;
    this.lessonLoading.set(true);
    try {
      const detail = await firstValueFrom(this.api.get<LessonDetail>(`/lessons/${lessonId}`));
      if (request === this.lessonRequestId) this.selectedLesson.set(detail);
    } catch {
      // Errors are surfaced globally by the HTTP interceptor.
    } finally {
      if (request === this.lessonRequestId) this.lessonLoading.set(false);
    }
  }

  private toCard(lesson: Lesson): DayCard {
    const startMinutes = athensMinutes(lesson.startsAt);
    const duration = Math.max(
      15,
      (new Date(lesson.endsAt).getTime() - new Date(lesson.startsAt).getTime()) / 60_000,
    );
    const clampedStart = Math.min(
      Math.max(startMinutes, GRID_START_HOUR * 60),
      GRID_END_HOUR * 60 - 15,
    );
    let top = ((clampedStart - GRID_START_HOUR * 60) / 60) * PX_PER_HOUR;
    top = Math.min(top, GRID_HEIGHT - MIN_CARD_HEIGHT);
    const visibleMinutes = Math.max(
      15,
      Math.min(duration, GRID_END_HOUR * 60 - clampedStart),
    );
    const height = Math.max(
      MIN_CARD_HEIGHT,
      Math.min((visibleMinutes / 60) * PX_PER_HOUR, GRID_HEIGHT - top),
    );
    const color = isValidHex(lesson.lessonSeries?.program?.color)
      ? lesson.lessonSeries.program.color
      : FALLBACK_COLOR;

    return {
      lesson,
      top,
      height,
      color,
      tint: `${color}18`,
      cancelled: lesson.status === 'CANCELLED',
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = (error.error as { message?: string | string[] } | null)?.message;
      if (Array.isArray(message) && message.length) return message.join(' · ');
      if (typeof message === 'string' && message.trim()) return message;
    }
    return this.transloco.translate('common.error');
  }
}
