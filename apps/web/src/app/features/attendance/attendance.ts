import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { addDaysKey, todayKey } from '../../core/dates';
import { FormatService } from '../../core/format.service';
import { ToastService } from '../../core/toast.service';
import type { AttendanceStatus, Lesson, LessonNote, LessonRoster } from '../../core/models';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

interface AttendanceDraft {
  status: AttendanceStatus | null;
  minutesLate: number | null;
  notes: string;
}

interface StatusOption {
  value: AttendanceStatus;
  key: string;
  icon: string;
  activeClass: string;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

@Component({
  selector: 'app-attendance-page',
  imports: [SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="attendance.title" subtitle="attendance.subtitle">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class="btn-secondary btn-icon"
            (click)="shiftDay(-1)"
            [attr.aria-label]="'pagination.previous' | transloco"
          >
            <app-icon name="chevron-left" [size]="16" />
          </button>
          <div
            class="flex h-9 min-w-[132px] items-center justify-center rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold tabular-nums"
          >
            {{ format.date(date(), 'weekday') }}
          </div>
          <button
            type="button"
            class="btn-secondary btn-icon"
            (click)="shiftDay(1)"
            [attr.aria-label]="'pagination.next' | transloco"
          >
            <app-icon name="chevron-right" [size]="16" />
          </button>
          <button type="button" class="btn-secondary btn-sm h-9" (click)="goToday()">
            {{ 'attendance.today' | transloco }}
          </button>
        </div>
      </app-page-header>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <section class="card self-start overflow-hidden">
          <div class="card-head">
            <div class="min-w-0">
              <p class="eyebrow">{{ 'attendance.lessons' | transloco }}</p>
              <p class="mt-1 text-sm font-semibold">{{ format.date(date(), 'long') }}</p>
            </div>
            <span class="badge badge-neutral">{{ lessons().length }}</span>
          </div>

          <div class="p-2">
            @if (loadingLessons()) {
              <div class="space-y-2 p-1">
                @for (row of [1, 2, 3, 4]; track row) {
                  <div class="rounded-xl border border-line p-3">
                    <div class="skeleton h-3 w-24"></div>
                    <div class="skeleton mt-2 h-4 w-40"></div>
                    <div class="skeleton mt-2 h-3 w-32"></div>
                  </div>
                }
              </div>
            } @else if (lessons().length === 0) {
              <div class="px-4 py-10 text-center">
                <p class="text-sm font-semibold text-ink">{{ 'attendance.empty' | transloco }}</p>
                <p class="mt-1 text-[12px] leading-relaxed text-ink-3">
                  {{ 'attendance.emptyHint' | transloco }}
                </p>
              </div>
            } @else {
              <div class="flex flex-col gap-1">
                @for (lesson of lessons(); track lesson.id) {
                  <button
                    type="button"
                    class="w-full rounded-xl border px-3 py-2.5 text-left transition-colors"
                    [class]="
                      selectedLessonId() === lesson.id
                        ? 'border-accent/45 bg-accent-soft'
                        : 'border-transparent hover:bg-surface-2'
                    "
                    (click)="selectLesson(lesson.id)"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[12px] font-semibold tabular-nums text-ink-2">
                        {{ format.timeRange(lesson.startsAt, lesson.endsAt) }}
                      </span>
                      <app-status-badge [status]="lesson.status" />
                    </div>
                    <p class="mt-1 truncate text-[13.5px] font-semibold text-ink">
                      {{ lesson.title }}
                    </p>
                    <div
                      class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3"
                    >
                      @if (lesson.room; as room) {
                        <span class="inline-flex items-center gap-1">
                          <app-icon name="map-pin" [size]="12" />
                          {{ room.name }}
                        </span>
                      }
                      @if (lesson.teacher; as teacher) {
                        <span class="inline-flex items-center gap-1">
                          <app-icon name="user" [size]="12" />
                          {{ teacher.firstName }} {{ teacher.lastName }}
                        </span>
                      }
                      <span class="inline-flex items-center gap-1">
                        <app-icon name="users" [size]="12" />
                        {{
                          'attendance.studentsCount'
                            | transloco: { count: lesson.students?.length ?? 0 }
                        }}
                      </span>
                    </div>
                  </button>
                }
              </div>
            }
          </div>
        </section>

        @if (loadingLessons() || loadingRoster()) {
          <section class="card overflow-hidden">
            <div class="card-head">
              <div class="space-y-2">
                <div class="skeleton h-5 w-52"></div>
                <div class="skeleton h-3 w-72"></div>
              </div>
            </div>
            <div class="space-y-3 p-5">
              @for (row of [1, 2, 3, 4, 5]; track row) {
                <div class="flex items-center gap-4">
                  <div class="skeleton h-9 w-9 rounded-full"></div>
                  <div class="skeleton h-4 flex-1"></div>
                  <div class="skeleton h-8 w-64"></div>
                </div>
              }
            </div>
          </section>
        } @else if (roster(); as data) {
          <section class="card overflow-hidden">
            <div class="card-head">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="truncate text-[16px] font-semibold text-ink">{{ data.lesson.title }}</h2>
                  @if (data.lesson.lessonSeries?.program; as program) {
                    <span class="badge badge-accent">{{ program.name }}</span>
                  }
                </div>
                <div
                  class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3"
                >
                  <span class="inline-flex items-center gap-1">
                    <app-icon name="clock" [size]="13" />
                    {{ format.timeRange(data.lesson.startsAt, data.lesson.endsAt) }}
                  </span>
                  @if (data.lesson.room; as room) {
                    <span class="inline-flex items-center gap-1">
                      <app-icon name="map-pin" [size]="13" />
                      {{ room.name }}
                    </span>
                  }
                  @if (data.lesson.teacher; as teacher) {
                    <span class="inline-flex items-center gap-1">
                      <app-icon name="user" [size]="13" />
                      {{ teacher.firstName }} {{ teacher.lastName }}
                    </span>
                  }
                  <span class="inline-flex items-center gap-1">
                    <app-icon name="calendar" [size]="13" />
                    {{ format.date(data.lesson.startsAt) }}
                  </span>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="btn-secondary btn-sm"
                  [disabled]="!canEdit()"
                  (click)="markAllPresent()"
                >
                  <app-icon name="user-check" [size]="14" />
                  {{ 'attendance.bulkPresent' | transloco }}
                </button>
                <button
                  type="button"
                  class="btn-secondary btn-sm"
                  [disabled]="!canEdit()"
                  (click)="clearAll()"
                >
                  <app-icon name="refresh" [size]="14" />
                  {{ 'attendance.bulkUnmarked' | transloco }}
                </button>
                <button
                  type="button"
                  class="btn-primary btn-sm"
                  [disabled]="!canEdit() || saving() || !hasRecords()"
                  (click)="save()"
                >
                  @if (saving()) {
                    {{ 'common.saving' | transloco }}
                  } @else {
                    <app-icon name="check" [size]="14" />
                    {{ 'attendance.save' | transloco }}
                  }
                </button>
              </div>
            </div>

            <div class="space-y-3 px-5 pt-4 sm:px-6">
              @if (data.lesson.status === 'CANCELLED') {
                <div class="alert alert-danger">
                  <app-icon name="alert" [size]="16" />
                  <span>{{ 'attendance.cancelled' | transloco }}</span>
                </div>
              }
              @if (!canWrite()) {
                <div class="alert alert-info">
                  <app-icon name="info" [size]="16" />
                  <span>{{ 'attendance.readOnly' | transloco }}</span>
                </div>
              }
              <div class="flex flex-wrap items-center gap-2">
                <span class="badge badge-success">
                  {{ 'attendance.present' | transloco }} · {{ summary().present }}
                </span>
                <span class="badge badge-danger">
                  {{ 'attendance.absent' | transloco }} · {{ summary().absent }}
                </span>
                <span class="badge badge-warning">
                  {{ 'attendance.late' | transloco }} · {{ summary().late }}
                </span>
                <span class="badge badge-neutral">
                  {{ 'attendance.excused' | transloco }} · {{ summary().excused }}
                </span>
                <span class="badge badge-info">
                  {{ 'attendance.unmarked' | transloco }} · {{ summary().unmarked }}
                </span>
              </div>
            </div>

            <div class="p-4 sm:p-5">
              <div class="table-wrap border-0 shadow-none">
                <table class="table min-w-[1020px]">
                  <thead>
                    <tr>
                      <th>{{ 'finance.table.student' | transloco }}</th>
                      <th>{{ 'attendance.markStatus' | transloco }}</th>
                      <th>{{ 'attendance.lateMinutes' | transloco }}</th>
                      <th>{{ 'attendance.notes' | transloco }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of rows(); track row.student.id) {
                      <tr>
                        <td>
                          <div class="flex items-center gap-3">
                            <app-avatar
                              [firstName]="row.student.firstName"
                              [lastName]="row.student.lastName"
                              [size]="34"
                            />
                            <div class="min-w-0">
                              <p class="truncate font-medium text-ink">
                                {{ row.student.firstName }} {{ row.student.lastName }}
                              </p>
                              <p class="text-[11.5px] text-ink-3">
                                {{ row.student.registrationNumber }}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div
                            class="inline-flex rounded-lg border border-line bg-surface p-0.5"
                          >
                            @for (option of statusOptions; track option.value) {
                              <button
                                type="button"
                                class="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50"
                                [class]="
                                  row.draft.status === option.value
                                    ? option.activeClass
                                    : 'border-transparent text-ink-3 hover:bg-surface-3 hover:text-ink'
                                "
                                [disabled]="!canEdit()"
                                [attr.title]="option.key | transloco"
                                (click)="setStatus(row.student.id, option.value)"
                              >
                                <app-icon [name]="option.icon" [size]="12" />
                                {{ option.key | transloco }}
                              </button>
                            }
                          </div>
                        </td>
                        <td>
                          @if (row.draft.status === 'LATE') {
                            <input name="minutesLate"
                              type="number"
                              min="0"
                              max="600"
                              class="input h-8 w-20"
                              [value]="row.draft.minutesLate ?? ''"
                              [disabled]="!canEdit()"
                              [attr.placeholder]="'attendance.lateMinutes' | transloco"
                              (input)="setMinutes(row.student.id, $any($event.target).value)" autocomplete="off" />
                          } @else {
                            <span class="text-ink-3">—</span>
                          }
                        </td>
                        <td>
                          <input name="notes"
                            type="text"
                            class="input h-8 min-w-[200px]"
                            [value]="row.draft.notes"
                            [disabled]="!canEdit()"
                            [attr.placeholder]="'attendance.notesPlaceholder' | transloco"
                            (input)="setNotes(row.student.id, $any($event.target).value)" autocomplete="off" />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-3">
                <span class="inline-flex items-center gap-1.5">
                  <app-icon name="info" [size]="13" />
                  {{ 'attendance.attendanceHint' | transloco }}
                </span>
                <span class="tabular-nums">
                  {{ summary().marked }} / {{ summary().total }}
                  {{ 'attendance.marked' | transloco }}
                </span>
              </div>
            </div>

            <div class="border-t border-line px-5 py-5 sm:px-6">
              <h3 class="text-sm font-semibold text-ink">
                {{ 'attendance.lessonNotes' | transloco }}
              </h3>
              @if (canWrite()) {
                <form class="mt-3" [formGroup]="noteForm" (ngSubmit)="addNote()">
                  <textarea name="content"
                    class="textarea"
                    formControlName="content"
                    [attr.placeholder]="'attendance.notePlaceholder' | transloco"
                  ></textarea>
                  <div class="mt-2 flex items-center justify-end gap-3">
                    <button
                      type="submit"
                      class="btn-secondary btn-sm"
                      [disabled]="noteForm.controls.content.invalid || addingNote()"
                    >
                      @if (addingNote()) {
                        {{ 'common.saving' | transloco }}
                      } @else {
                        <app-icon name="plus" [size]="14" />
                        {{ 'attendance.addNote' | transloco }}
                      }
                    </button>
                  </div>
                </form>
              }
              <ul class="mt-4 space-y-2.5">
                @for (note of lessonNotes(); track note.id) {
                  <li class="rounded-xl border border-line bg-surface-2 px-4 py-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="text-[12.5px] font-semibold text-ink">
                        {{ note.author.firstName }} {{ note.author.lastName }}
                      </span>
                      <span class="text-[11px] text-ink-3">
                        {{ format.timeAgo(note.createdAt) }}
                      </span>
                    </div>
                    <p class="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
                      {{ note.content }}
                    </p>
                  </li>
                } @empty {
                  <li class="text-[12.5px] text-ink-3">
                    {{ 'attendance.lessonNotes' | transloco }} —
                    {{ 'common.none' | transloco }}
                  </li>
                }
              </ul>
            </div>
          </section>
        } @else if (lessons().length === 0) {
          <div class="card">
            <app-empty-state
              title="attendance.empty"
              message="attendance.emptyHint"
              icon="calendar"
            />
          </div>
        } @else {
          <div class="card">
            <app-empty-state
              title="attendance.noRoster"
              message="attendance.emptyHint"
              icon="users"
            />
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendancePage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);

  readonly format = inject(FormatService);

  readonly date = signal(todayKey());
  readonly lessons = signal<Lesson[]>([]);
  readonly selectedLessonId = signal<string | null>(null);
  readonly roster = signal<LessonRoster | null>(null);
  readonly draft = signal<Record<string, AttendanceDraft>>({});
  readonly loadingLessons = signal(true);
  readonly loadingRoster = signal(false);
  readonly saving = signal(false);
  readonly addingNote = signal(false);

  readonly noteForm = this.fb.nonNullable.group({
    content: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  readonly statusOptions: StatusOption[] = [
    {
      value: 'PRESENT',
      key: 'attendance.present',
      icon: 'check',
      activeClass: 'border-success bg-success text-white',
    },
    {
      value: 'ABSENT',
      key: 'attendance.absent',
      icon: 'x',
      activeClass: 'border-danger bg-danger text-white',
    },
    {
      value: 'LATE',
      key: 'attendance.late',
      icon: 'clock',
      activeClass: 'border-warning bg-warning text-white',
    },
    {
      value: 'EXCUSED',
      key: 'attendance.excused',
      icon: 'badge-check',
      activeClass: 'border-ink-3 bg-surface-3 text-ink',
    },
  ];

  readonly canWrite = computed(() => this.auth.has('attendance.write'));

  readonly canEdit = computed(() => {
    const lesson = this.roster()?.lesson;
    return this.canWrite() && !!lesson && lesson.status !== 'CANCELLED';
  });

  readonly rows = computed(() => {
    const data = this.roster();
    if (!data) return [];
    const drafts = this.draft();
    return data.students.map((row) => ({
      student: row.student,
      draft: drafts[row.student.id] ?? this.emptyDraft(),
    }));
  });

  readonly summary = computed(() => {
    const result = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      unmarked: 0,
      marked: 0,
      total: 0,
    };
    for (const row of this.rows()) {
      result.total += 1;
      switch (row.draft.status) {
        case 'PRESENT':
          result.present += 1;
          result.marked += 1;
          break;
        case 'ABSENT':
          result.absent += 1;
          result.marked += 1;
          break;
        case 'LATE':
          result.late += 1;
          result.marked += 1;
          break;
        case 'EXCUSED':
          result.excused += 1;
          result.marked += 1;
          break;
        default:
          result.unmarked += 1;
          break;
      }
    }
    return result;
  });

  readonly hasRecords = computed(() => this.rows().some((row) => row.draft.status !== null));

  readonly lessonNotes = computed(() => this.roster()?.lesson.notes ?? []);

  private loadSeq = 0;
  private rosterSeq = 0;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const requested = params.get('date');
      const day = requested && DATE_KEY.test(requested) ? requested : todayKey();
      const lessonId = params.get('lessonId');
      this.date.set(day);
      void this.loadDay(day, lessonId);
    });
  }

  shiftDay(delta: number): void {
    const day = addDaysKey(this.date(), delta);
    this.date.set(day);
    void this.loadDay(day, null);
  }

  goToday(): void {
    const day = todayKey();
    this.date.set(day);
    void this.loadDay(day, null);
  }

  async selectLesson(lessonId: string): Promise<void> {
    this.selectedLessonId.set(lessonId);
    this.roster.set(null);
    this.draft.set({});
    this.loadingRoster.set(true);
    const seq = ++this.rosterSeq;
    try {
      const roster = await firstValueFrom(
        this.api.get<LessonRoster>(`/lessons/${lessonId}/attendance`),
      );
      if (seq !== this.rosterSeq) return;
      this.applyRoster(roster);
    } catch {
      if (seq === this.rosterSeq) this.roster.set(null);
    } finally {
      if (seq === this.rosterSeq) this.loadingRoster.set(false);
    }
  }

  setStatus(studentId: string, status: AttendanceStatus): void {
    this.draft.update((current) => {
      const existing = current[studentId] ?? this.emptyDraft();
      return { ...current, [studentId]: { ...existing, status } };
    });
  }

  setMinutes(studentId: string, raw: string): void {
    const trimmed = raw.trim();
    let minutes: number | null = null;
    if (trimmed !== '') {
      const value = Number(trimmed);
      if (!Number.isFinite(value)) return;
      minutes = Math.max(0, Math.min(600, Math.trunc(value)));
    }
    this.draft.update((current) => {
      const existing = current[studentId] ?? this.emptyDraft();
      return { ...current, [studentId]: { ...existing, minutesLate: minutes } };
    });
  }

  setNotes(studentId: string, notes: string): void {
    this.draft.update((current) => {
      const existing = current[studentId] ?? this.emptyDraft();
      return { ...current, [studentId]: { ...existing, notes } };
    });
  }

  markAllPresent(): void {
    this.draft.update((current) => {
      const next: Record<string, AttendanceDraft> = {};
      for (const row of this.roster()?.students ?? []) {
        const existing = current[row.student.id] ?? this.emptyDraft();
        next[row.student.id] = { ...existing, status: 'PRESENT' };
      }
      return next;
    });
  }

  clearAll(): void {
    this.draft.update((current) => {
      const next: Record<string, AttendanceDraft> = {};
      for (const row of this.roster()?.students ?? []) {
        const existing = current[row.student.id] ?? this.emptyDraft();
        next[row.student.id] = { ...existing, status: null, minutesLate: null };
      }
      return next;
    });
  }

  async save(): Promise<void> {
    const data = this.roster();
    if (!data || !this.canEdit() || this.saving()) return;
    const records = data.students.flatMap((row) => {
      const draft = this.draft()[row.student.id];
      if (!draft?.status) return [];
      return [
        {
          studentId: row.student.id,
          status: draft.status,
          ...(draft.status === 'LATE' && draft.minutesLate !== null
            ? { minutesLate: draft.minutesLate }
            : {}),
          ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        },
      ];
    });
    if (!records.length) return;

    this.saving.set(true);
    try {
      const roster = await firstValueFrom(
        this.api.put<LessonRoster>(`/lessons/${data.lesson.id}/attendance`, { records }),
      );
      this.applyRoster(roster);
      this.toast.success(this.transloco.translate('attendance.saved'));
    } catch {
      // Errors are surfaced globally by the HTTP interceptor.
    } finally {
      this.saving.set(false);
    }
  }

  async addNote(): Promise<void> {
    const data = this.roster();
    if (!data || !this.canWrite() || this.noteForm.invalid || this.addingNote()) return;
    const content = this.noteForm.controls.content.value.trim();
    if (!content) return;

    this.addingNote.set(true);
    try {
      await firstValueFrom(
        this.api.post<LessonNote>(`/lessons/${data.lesson.id}/notes`, { content }),
      );
      const lesson = await firstValueFrom(
        this.api.get<LessonRoster['lesson']>(`/lessons/${data.lesson.id}`),
      );
      this.roster.update((current) =>
        current && current.lesson.id === lesson.id ? { ...current, lesson } : current,
      );
      this.noteForm.reset({ content: '' });
      this.toast.success(this.transloco.translate('attendance.noteSaved'));
    } catch {
      // Errors are surfaced globally by the HTTP interceptor.
    } finally {
      this.addingNote.set(false);
    }
  }

  private async loadDay(day: string, preferredLessonId: string | null): Promise<void> {
    const seq = ++this.loadSeq;
    this.rosterSeq += 1;
    this.loadingLessons.set(true);
    this.loadingRoster.set(false);
    this.roster.set(null);
    this.draft.set({});
    this.selectedLessonId.set(null);

    try {
      const response = await firstValueFrom(
        this.api.list<Lesson>('/lessons', { from: day, to: day }),
      );
      if (seq !== this.loadSeq) return;
      const lessons = response.data;
      this.lessons.set(lessons);
      const preferred = preferredLessonId
        ? lessons.find((lesson) => lesson.id === preferredLessonId)
        : undefined;
      const target =
        preferred ??
        lessons.find((lesson) => lesson.status !== 'CANCELLED') ??
        lessons[0];
      if (target) {
        void this.selectLesson(target.id);
      }
    } catch {
      if (seq === this.loadSeq) {
        this.lessons.set([]);
      }
    } finally {
      if (seq === this.loadSeq) this.loadingLessons.set(false);
    }
  }

  private applyRoster(roster: LessonRoster): void {
    this.roster.set(roster);
    const draft: Record<string, AttendanceDraft> = {};
    for (const row of roster.students) {
      const attendance = row.attendance;
      draft[row.student.id] = {
        status: attendance?.status ?? null,
        minutesLate: attendance?.minutesLate ?? null,
        notes: attendance?.notes ?? '',
      };
    }
    this.draft.set(draft);
    this.lessons.update((lessons) =>
      lessons.map((lesson) =>
        lesson.id === roster.lesson.id
          ? { ...lesson, status: roster.lesson.status, _count: roster.lesson._count ?? lesson._count }
          : lesson,
      ),
    );
  }

  private emptyDraft(): AttendanceDraft {
    return { status: null, minutesLate: null, notes: '' };
  }
}
