import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { saveBlob } from '../../core/download';
import { FormatService } from '../../core/format.service';
import type {
  AcademicsOptions,
  DocumentRecord,
  Exam,
  ExamOutcome,
  ExamPeriod,
  ExamRoster,
  ExamRosterRow,
  ExamStatus,
  ExamType,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

type ExamFilter = 'all' | 'scheduled' | 'completed';

const SCHEDULED_STATUSES: ExamStatus[] = ['DRAFT', 'SCHEDULED', 'GRADING'];
const COMPLETED_STATUSES: ExamStatus[] = ['PENDING_APPROVAL', 'PUBLISHED', 'ARCHIVED'];
const EXAM_TYPES: ExamType[] = ['PERIODIC', 'PROMOTION', 'GRADUATION'];
const OUTCOMES: ExamOutcome[] = ['PENDING', 'PASS', 'FAIL'];

interface RowEdit {
  grade: string;
  outcome: ExamOutcome;
  notes: string;
}

@Component({
  selector: 'app-exams-page',
  imports: [SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="exams.title" subtitle="exams.subtitle">
        @if (canWrite()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <app-icon name="plus" [size]="16" />
            {{ 'exams.new' | transloco }}
          </button>
        }
      </app-page-header>

      @if (loading()) {
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          @for (row of [1, 2, 3, 4]; track row) {
            <div class="card p-5">
              <div class="skeleton h-3 w-20"></div>
              <div class="skeleton mt-3 h-7 w-16"></div>
            </div>
          }
        </div>
      } @else {
        <div class="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
          <app-stat-card
            label="exams.stats.total"
            [value]="format.number(stats().total)"
            icon="graduation"
            tone="accent"
          />
          <app-stat-card
            label="exams.stats.upcoming"
            [value]="format.number(stats().scheduled)"
            icon="calendar"
            tone="info"
          />
          <app-stat-card
            label="exams.stats.completed"
            [value]="format.number(stats().completed)"
            icon="check-circle"
            tone="success"
          />
          <app-stat-card
            label="exams.stats.participation"
            [value]="format.number(stats().participation)"
            icon="users"
          />
        </div>
      }

      <div class="my-4 flex w-full flex-wrap gap-1 rounded-xl border border-line bg-surface p-1 shadow-card sm:inline-flex sm:w-auto sm:gap-0">
        @for (item of filterTabs(); track item.value) {
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
            [class]="
              filter() === item.value
                ? 'bg-accent-soft text-accent-strong'
                : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
            "
            (click)="setFilter(item.value)"
          >
            {{ item.key | transloco }}
            <span class="badge badge-neutral tabular-nums">{{ item.count }}</span>
          </button>
        }
      </div>

      @if (loading()) {
        <div class="table-wrap p-5">
          <div class="space-y-3">
            @for (row of [1, 2, 3, 4, 5]; track row) {
              <div class="flex items-center gap-4">
                <div class="skeleton h-4 w-48"></div>
                <div class="skeleton h-4 w-24"></div>
                <div class="skeleton h-4 w-20"></div>
                <div class="skeleton h-4 flex-1"></div>
              </div>
            }
          </div>
        </div>
      } @else if (filtered().length === 0) {
        <div class="card">
          <app-empty-state title="exams.empty" message="exams.emptyHint" icon="graduation" />
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table min-w-[1180px]">
            <thead>
              <tr>
                <th>{{ 'exams.columns.title' | transloco }}</th>
                <th>{{ 'exams.columns.program' | transloco }}</th>
                <th>{{ 'exams.columns.level' | transloco }}</th>
                <th>{{ 'exams.columns.date' | transloco }}</th>
                <th>{{ 'exams.columns.status' | transloco }}</th>
                <th class="text-right">{{ 'exams.columns.participation' | transloco }}</th>
                <th class="text-right">{{ 'exams.columns.average' | transloco }}</th>
                <th class="text-right">{{ 'exams.columns.passed' | transloco }}</th>
                <th>{{ 'exams.columns.location' | transloco }}</th>
                <th class="w-12"></th>
              </tr>
            </thead>
            <tbody>
              @for (exam of filtered(); track exam.id) {
                <tr>
                  <td>
                    <div class="flex items-center gap-2.5">
                      <span
                        class="h-2 w-2 shrink-0 rounded-full"
                        [style.background]="exam.program?.color || 'var(--accent)'"
                      ></span>
                      <div class="min-w-0">
                        <p class="font-medium text-ink">{{ exam.title }}</p>
                        <p class="text-[11px] text-ink-3">
                          {{ ('examType.' + exam.type) | transloco }}
                          @if (exam.period) {
                            · {{ exam.period.name }}
                          }
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    @if (exam.program; as program) {
                      {{ program.name }}
                    } @else {
                      <span class="text-ink-3">—</span>
                    }
                  </td>
                  <td>
                    @if (exam.level; as level) {
                      {{ level.name }}
                    } @else {
                      <span class="text-ink-3">—</span>
                    }
                  </td>
                  <td class="whitespace-nowrap">{{ format.date(exam.examDate) }}</td>
                  <td><app-status-badge [status]="exam.status" /></td>
                  <td class="text-right tabular-nums">
                    {{ 'exams.participationValue' | transloco: { count: exam.participation } }}
                  </td>
                  <td class="text-right font-semibold tabular-nums text-ink">
                    @if (exam.averageGrade !== null) {
                      {{ format.number(exam.averageGrade, 1) }}
                    } @else {
                      <span class="font-normal text-ink-3">—</span>
                    }
                  </td>
                  <td class="text-right tabular-nums">
                    {{
                      'exams.passedValue'
                        | transloco: { passed: exam.passed, total: exam.participation }
                    }}
                  </td>
                  <td>
                    @if (exam.location) {
                      {{ exam.location }}
                    } @else {
                      <span class="text-ink-3">—</span>
                    }
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn-ghost btn-icon-sm"
                      (click)="openResults(exam)"
                      [attr.aria-label]="'exams.manage' | transloco"
                    >
                      <app-icon name="file-text" [size]="15" />
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-drawer
      [open]="createOpen()"
      title="exams.create.title"
      subtitle="exams.create.hint"
      size="md"
      [showFooter]="true"
      (closed)="createOpen.set(false)"
    >
      <form [formGroup]="createForm" class="space-y-4" (ngSubmit)="submitCreate()">
        <label class="field">
          <span class="field-label">{{ 'exams.columns.title' | transloco }}</span>
          <input name="title" class="input" formControlName="title" maxlength="200" autocomplete="off" />
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="field">
            <span class="field-label">{{ 'exams.columns.program' | transloco }}</span>
            <select name="programId" class="select" formControlName="programId">
              <option value="">{{ 'exams.create.selectProgram' | transloco }}</option>
              @for (program of options()?.programs ?? []; track program.id) {
                <option [value]="program.id">{{ program.name }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'exams.columns.level' | transloco }}</span>
            <select name="levelId" class="select" formControlName="levelId">
              <option value="">{{ 'exams.create.noLevel' | transloco }}</option>
              @for (level of options()?.levels ?? []; track level.id) {
                <option [value]="level.id">{{ level.name }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'exams.type' | transloco }}</span>
            <select name="type" class="select" formControlName="type">
              @for (type of examTypes; track type) {
                <option [value]="type">{{ ('examType.' + type) | transloco }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'exams.create.period' | transloco }}</span>
            <select name="periodId" class="select" formControlName="periodId">
              <option value="">{{ 'exams.create.noPeriod' | transloco }}</option>
              @for (period of periods(); track period.id) {
                <option [value]="period.id">{{ period.name }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'exams.columns.date' | transloco }}</span>
            <input name="examDate" class="input" type="datetime-local" formControlName="examDate" autocomplete="off" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'exams.create.gradingDeadline' | transloco }}</span>
            <input name="gradingDeadline" class="input" type="datetime-local" formControlName="gradingDeadline" autocomplete="off" />
          </label>
        </div>
        <label class="field">
          <span class="field-label">{{ 'exams.columns.location' | transloco }}</span>
          <input name="location" class="input" formControlName="location" maxlength="200" autocomplete="off" />
        </label>
        <label class="field">
          <span class="field-label">{{ 'common.notes' | transloco }}</span>
          <textarea name="notes" class="textarea" rows="2" formControlName="notes" maxlength="2000"></textarea>
        </label>
        <div drawer-footer class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" (click)="createOpen.set(false)">
            {{ 'common.cancel' | transloco }}
          </button>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ (saving() ? 'common.saving' : 'exams.create.submit') | transloco }}
          </button>
        </div>
      </form>
    </app-drawer>

    <app-drawer
      [open]="resultsOpen()"
      [title]="rosterTitle()"
      [translateTitle]="false"
      subtitle="exams.results.subtitle"
      size="xl"
      [showFooter]="true"
      (closed)="closeResults()"
    >
      @if (rosterLoading()) {
        <div class="space-y-3">
          <div class="skeleton h-8 w-64"></div>
          <div class="skeleton h-24 w-full"></div>
          <div class="skeleton h-64 w-full"></div>
        </div>
      } @else if (roster(); as data) {
        <div class="flex flex-wrap items-center gap-2">
          <app-status-badge [status]="data.exam.status" />
          <span class="badge badge-neutral">{{ 'examType.' + data.exam.type | transloco }}</span>
          @if (data.exam.period) {
            <span class="badge badge-neutral">{{ data.exam.period.name }}</span>
          }
          <span class="text-[12px] text-ink-3">
            {{ format.dateTime(data.exam.examDate) }}
            @if (data.exam.location) {
              · {{ data.exam.location }}
            }
          </span>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-xl border border-line bg-surface-2 p-3">
            <p class="text-[10.5px] uppercase tracking-wide text-ink-3">
              {{ 'exams.results.eligible' | transloco }}
            </p>
            <p class="mt-1 text-[18px] font-semibold tabular-nums">{{ data.summary.eligible }}</p>
          </div>
          <div class="rounded-xl border border-line bg-surface-2 p-3">
            <p class="text-[10.5px] uppercase tracking-wide text-ink-3">
              {{ 'exams.results.graded' | transloco }}
            </p>
            <p class="mt-1 text-[18px] font-semibold tabular-nums">{{ data.summary.graded }}</p>
          </div>
          <div class="rounded-xl border border-line bg-surface-2 p-3">
            <p class="text-[10.5px] uppercase tracking-wide text-ink-3">
              {{ 'exams.results.approved' | transloco }}
            </p>
            <p class="mt-1 text-[18px] font-semibold tabular-nums">{{ data.summary.approved }}</p>
          </div>
          <div class="rounded-xl border border-line bg-surface-2 p-3">
            <p class="text-[10.5px] uppercase tracking-wide text-ink-3">
              {{ 'exams.results.published' | transloco }}
            </p>
            <p class="mt-1 text-[18px] font-semibold tabular-nums">{{ data.summary.published }}</p>
          </div>
        </div>

        <div class="mt-5">
          <h3 class="text-sm font-semibold text-ink">{{ 'exams.committee' | transloco }}</h3>
          @if (data.exam.committee.length) {
            <div class="mt-2 flex flex-wrap gap-2">
              @for (member of data.exam.committee; track member.id) {
                <span class="badge badge-neutral">
                  {{ member.teacher.lastName }} {{ member.teacher.firstName }} ·
                  {{ ('committeeRole.' + member.role) | transloco }}
                </span>
              }
            </div>
          } @else {
            <p class="mt-1 text-[12px] text-ink-3">{{ 'exams.noCommittee' | transloco }}</p>
          }
        </div>

        @if (data.students.length === 0) {
          <app-empty-state title="exams.results.empty" message="exams.results.emptyHint" icon="users" />
        } @else {
          <div class="table-wrap mt-5">
            <table class="table min-w-[640px]">
              <thead>
                <tr>
                  <th>{{ 'exams.results.student' | transloco }}</th>
                  <th>{{ 'exams.results.grade' | transloco }}</th>
                  <th>{{ 'exams.results.outcome' | transloco }}</th>
                  <th>{{ 'exams.results.state' | transloco }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of data.students; track row.student.id) {
                  <tr>
                    <td>
                      <div class="flex items-center gap-2.5">
                        <app-avatar
                          [firstName]="row.student.firstName"
                          [lastName]="row.student.lastName"
                          [size]="30"
                        />
                        <div>
                          <p class="font-medium text-ink">
                            {{ row.student.lastName }} {{ row.student.firstName }}
                          </p>
                          <p class="text-[11px] text-ink-3">
                            {{ row.student.registrationNumber }}
                            @if (!row.eligible) {
                              · {{ 'exams.results.notEligible' | transloco }}
                            }
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <input name="grade"
                        type="number"
                        class="input w-24"
                        min="0"
                        max="100"
                        step="0.5"
                        [value]="editFor(row).grade"
                        [disabled]="!canGrade() || examLocked()"
                        (input)="setGrade(row, $event)" autocomplete="off" />
                    </td>
                    <td>
                      <select name="outcome"
                        class="select w-36"
                        [value]="editFor(row).outcome"
                        [disabled]="!canGrade() || examLocked()"
                        (change)="setOutcome(row, $event)"
                      >
                        @for (outcome of outcomes; track outcome) {
                          <option [value]="outcome">{{ ('examOutcome.' + outcome) | transloco }}</option>
                        }
                      </select>
                    </td>
                    <td class="text-[12px]">
                      @if (row.result?.publishedAt) {
                        <span class="badge badge-success">{{ 'exams.results.publishedState' | transloco }}</span>
                      } @else if (row.result?.approvedAt) {
                        <span class="badge badge-info">{{ 'exams.results.approvedState' | transloco }}</span>
                      } @else if (row.result?.submittedAt) {
                        <span class="badge badge-warning">{{ 'exams.results.submittedState' | transloco }}</span>
                      } @else if (row.result?.grade !== null && row.result?.grade !== undefined) {
                        <span class="badge badge-neutral">{{ 'exams.results.savedState' | transloco }}</span>
                      } @else {
                        <span class="text-ink-3">—</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

      } @else {
        <app-empty-state title="common.noResults" icon="graduation" />
      }

      <div drawer-footer class="flex flex-wrap items-center justify-between gap-2">
        <button type="button" class="btn-secondary" (click)="closeResults()">
          {{ 'common.close' | transloco }}
        </button>
        @if (roster(); as data) {
          <div class="flex flex-wrap gap-2">
            @if (canWrite()) {
              <button
                type="button"
                class="btn-secondary btn-sm"
                [disabled]="busy()"
                (click)="generateMinutes()"
              >
                {{ 'exams.results.minutes' | transloco }}
              </button>
            }
            @if (canGrade() && !examLocked()) {
              <button
                type="button"
                class="btn-secondary btn-sm"
                [disabled]="savingResults()"
                (click)="saveResults()"
              >
                {{ (savingResults() ? 'common.saving' : 'exams.results.save') | transloco }}
              </button>
              <button
                type="button"
                class="btn-secondary btn-sm"
                [disabled]="busy() || data.exam.status === 'SCHEDULED'"
                (click)="submitResults()"
              >
                {{ 'exams.results.submit' | transloco }}
              </button>
            }
            @if (canApprove() && data.exam.status === 'PENDING_APPROVAL') {
              <button
                type="button"
                class="btn-secondary btn-sm"
                [disabled]="busy()"
                (click)="approveResults()"
              >
                {{ 'exams.results.approve' | transloco }}
              </button>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                [disabled]="busy()"
                (click)="publishResults()"
              >
                {{ 'exams.results.publish' | transloco }}
              </button>
            }
          </div>
        }
      </div>
    </app-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamsPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly format = inject(FormatService);

  readonly examTypes = EXAM_TYPES;
  readonly outcomes = OUTCOMES;

  readonly exams = signal<Exam[]>([]);
  readonly loading = signal(true);
  readonly filter = signal<ExamFilter>('all');
  readonly periods = signal<ExamPeriod[]>([]);
  readonly options = signal<AcademicsOptions | null>(null);

  readonly createOpen = signal(false);
  readonly saving = signal(false);
  readonly resultsOpen = signal(false);
  readonly rosterLoading = signal(false);
  readonly roster = signal<ExamRoster | null>(null);
  readonly savingResults = signal(false);
  readonly busy = signal(false);
  readonly edits = signal<Record<string, RowEdit>>({});
  private rosterExamId: string | null = null;

  readonly canWrite = computed(() => this.auth.has('exams.write'));
  readonly canGrade = computed(() => this.auth.has('exams.grade'));
  readonly canApprove = computed(() => this.auth.has('exams.approve'));

  readonly createForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    programId: ['', Validators.required],
    levelId: [''],
    periodId: [''],
    type: ['PERIODIC' as ExamType, Validators.required],
    examDate: [tomorrowAt(18, 0), Validators.required],
    gradingDeadline: [''],
    location: [''],
    notes: [''],
  });

  readonly stats = computed(() => {
    const exams = this.exams();
    return {
      total: exams.length,
      scheduled: exams.filter((exam) => SCHEDULED_STATUSES.includes(exam.status)).length,
      completed: exams.filter((exam) => COMPLETED_STATUSES.includes(exam.status)).length,
      participation: exams.reduce((sum, exam) => sum + exam.participation, 0),
    };
  });

  readonly filtered = computed(() => {
    const exams = this.exams();
    const filter = this.filter();
    if (filter === 'all') return exams;
    const statuses = filter === 'scheduled' ? SCHEDULED_STATUSES : COMPLETED_STATUSES;
    return exams.filter((exam) => statuses.includes(exam.status));
  });

  readonly filterTabs = computed(() => {
    const stats = this.stats();
    return [
      { value: 'all' as ExamFilter, key: 'exams.all', count: stats.total },
      { value: 'scheduled' as ExamFilter, key: 'exams.upcoming', count: stats.scheduled },
      { value: 'completed' as ExamFilter, key: 'exams.completed', count: stats.completed },
    ];
  });

  readonly rosterTitle = computed(() => {
    const exam = this.roster()?.exam;
    return exam ? `Εξετάσεις · ${exam.title}` : 'Εξετάσεις';
  });

  readonly examLocked = computed(() => {
    const status = this.roster()?.exam.status;
    return status === 'PUBLISHED' || status === 'ARCHIVED' || status === 'CANCELLED';
  });

  constructor() {
    void this.load();
  }

  setFilter(filter: ExamFilter): void {
    this.filter.set(filter);
  }

  async openCreate(): Promise<void> {
    if (!this.canWrite()) return;
    this.createForm.reset({
      title: '',
      programId: '',
      levelId: '',
      periodId: '',
      type: 'PERIODIC',
      examDate: tomorrowAt(18, 0),
      gradingDeadline: '',
      location: '',
      notes: '',
    });
    this.createOpen.set(true);
    if (!this.options()) await this.loadOptions();
    if (!this.periods().length) await this.loadPeriods();
  }

  async submitCreate(): Promise<void> {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    if (this.saving()) return;
    this.saving.set(true);
    const value = this.createForm.getRawValue();
    try {
      await firstValueFrom(
        this.api.post<Exam>('/exams', {
          title: value.title.trim(),
          programId: value.programId,
          levelId: value.levelId || undefined,
          periodId: value.periodId || undefined,
          type: value.type,
          examDate: value.examDate,
          gradingDeadline: value.gradingDeadline || undefined,
          location: value.location.trim() || undefined,
          notes: value.notes.trim() || undefined,
        }),
      );
      this.toast.success(this.transloco.translate('exams.toasts.created'));
      this.createOpen.set(false);
      await this.load();
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.saving.set(false);
    }
  }

  async openResults(exam: Exam): Promise<void> {
    this.rosterExamId = exam.id;
    this.resultsOpen.set(true);
    this.roster.set(null);
    await this.loadRoster(exam.id);
  }

  closeResults(): void {
    this.resultsOpen.set(false);
    this.roster.set(null);
    this.rosterExamId = null;
    this.edits.set({});
  }

  editFor(row: ExamRosterRow): RowEdit {
    return (
      this.edits()[row.student.id] ?? {
        grade: row.result?.grade === null || row.result?.grade === undefined ? '' : String(row.result.grade),
        outcome: row.result?.outcome ?? 'PENDING',
        notes: row.result?.notes ?? '',
      }
    );
  }

  setGrade(row: ExamRosterRow, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.updateEdit(row, { grade: value });
  }

  setOutcome(row: ExamRosterRow, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as ExamOutcome;
    this.updateEdit(row, { outcome: value });
  }

  async saveResults(): Promise<boolean> {
    const examId = this.rosterExamId;
    const data = this.roster();
    if (!examId || !data || this.savingResults()) return false;
    const results = data.students
      .map((row) => ({ row, edit: this.editFor(row) }))
      .filter(({ edit }) => edit.grade.trim() !== '' || edit.outcome !== 'PENDING')
      .map(({ row, edit }) => ({
        studentId: row.student.id,
        grade: edit.grade.trim() === '' ? null : Number(edit.grade),
        outcome: edit.outcome,
        notes: edit.notes.trim() || undefined,
      }));
    if (!results.length) {
      this.toast.info(this.transloco.translate('exams.results.nothingToSave'));
      return false;
    }
    this.savingResults.set(true);
    try {
      await firstValueFrom(this.api.put<ExamRoster>(`/exams/${examId}/results`, { results }));
      this.toast.success(this.transloco.translate('exams.results.saved'));
      await this.loadRoster(examId);
      await this.load();
      return true;
    } catch {
      // Errors surface through the global interceptor.
      return false;
    } finally {
      this.savingResults.set(false);
    }
  }

  async submitResults(): Promise<void> {
    const examId = this.rosterExamId;
    if (!examId || this.busy()) return;
    this.busy.set(true);
    try {
      const saved = await this.saveResults();
      if (!saved) return;
      await firstValueFrom(this.api.post(`/exams/${examId}/results/submit`));
      this.toast.success(this.transloco.translate('exams.results.submitted'));
      await this.loadRoster(examId);
      await this.load();
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.busy.set(false);
    }
  }

  async approveResults(): Promise<void> {
    const examId = this.rosterExamId;
    if (!examId || this.busy()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.post(`/exams/${examId}/results/approve`));
      this.toast.success(this.transloco.translate('exams.results.approved'));
      await this.loadRoster(examId);
      await this.load();
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.busy.set(false);
    }
  }

  async publishResults(): Promise<void> {
    const examId = this.rosterExamId;
    if (!examId || this.busy()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.post(`/exams/${examId}/publish`));
      this.toast.success(this.transloco.translate('exams.results.publishedToast'));
      await this.loadRoster(examId);
      await this.load();
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.busy.set(false);
    }
  }

  async generateMinutes(): Promise<void> {
    const examId = this.rosterExamId;
    if (!examId || this.busy()) return;
    this.busy.set(true);
    try {
      const document = await firstValueFrom(
        this.api.post<DocumentRecord>(`/exams/${examId}/minutes`),
      );
      const blob = await firstValueFrom(this.api.blob(`/documents/${document.id}/pdf`));
      saveBlob(blob, document.fileName ?? 'praktiko-exetasis.pdf');
      this.toast.success(this.transloco.translate('exams.results.minutesDownloaded'));
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.busy.set(false);
    }
  }

  private updateEdit(row: ExamRosterRow, patch: Partial<RowEdit>): void {
    const current = this.editFor(row);
    this.edits.update((edits) => ({
      ...edits,
      [row.student.id]: { ...current, ...patch },
    }));
  }

  private async loadRoster(examId: string): Promise<void> {
    this.rosterLoading.set(true);
    try {
      const data = await firstValueFrom(this.api.get<ExamRoster>(`/exams/${examId}/results`));
      this.roster.set(data);
      this.edits.set(
        Object.fromEntries(
          data.students.map((row) => [
            row.student.id,
            {
              grade:
                row.result?.grade === null || row.result?.grade === undefined
                  ? ''
                  : String(row.result.grade),
              outcome: row.result?.outcome ?? 'PENDING',
              notes: row.result?.notes ?? '',
            } satisfies RowEdit,
          ]),
        ),
      );
    } catch {
      this.roster.set(null);
    } finally {
      this.rosterLoading.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(this.api.list<Exam>('/exams'));
      this.exams.set(response.data);
    } catch {
      this.exams.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPeriods(): Promise<void> {
    try {
      const periods = await firstValueFrom(this.api.get<ExamPeriod[]>('/exams/periods'));
      this.periods.set(periods);
    } catch {
      this.periods.set([]);
    }
  }

  private async loadOptions(): Promise<void> {
    try {
      const options = await firstValueFrom(this.api.get<AcademicsOptions>('/academics/options'));
      this.options.set(options);
    } catch {
      this.options.set(null);
    }
  }
}

function tomorrowAt(hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, minute, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
