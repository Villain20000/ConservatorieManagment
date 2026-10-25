import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { FormatService } from '../../core/format.service';
import type { AcademicsOptions, Assignment, AssignmentSubmission, Student } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

type AssignmentFilter = 'all' | 'open' | 'closed';
type SubmissionState = 'pending' | 'submitted' | 'graded';

interface TargetRow {
  studentId: string;
  name: string;
  registrationNumber: string;
  state: SubmissionState;
  submission: AssignmentSubmission | null;
}

@Component({
  selector: 'app-assignments-page',
  imports: [SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="assignments.title" subtitle="assignments.subtitle">
        <button type="button" class="btn btn-primary" (click)="openCreate()">
          <app-icon name="plus" [size]="16" />
          {{ 'assignments.new' | transloco }}
        </button>
      </app-page-header>

      <div class="my-4 flex w-full flex-wrap gap-1 rounded-xl border border-line bg-surface p-1 shadow-card sm:inline-flex sm:w-auto">
        @for (item of filterTabs(); track item.value) {
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
            [class]="
              filter() === item.value
                ? 'bg-accent-soft text-accent-strong'
                : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
            "
            (click)="filter.set(item.value)"
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
          <app-empty-state title="assignments.empty" message="assignments.emptyHint" icon="book" />
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table min-w-[900px]">
            <thead>
              <tr>
                <th>{{ 'assignments.columns.title' | transloco }}</th>
                <th>{{ 'assignments.columns.program' | transloco }}</th>
                <th>{{ 'assignments.columns.assigned' | transloco }}</th>
                <th>{{ 'assignments.columns.due' | transloco }}</th>
                <th>{{ 'assignments.columns.status' | transloco }}</th>
                <th class="text-right">{{ 'assignments.columns.progress' | transloco }}</th>
                <th class="w-12"></th>
              </tr>
            </thead>
            <tbody>
              @for (assignment of filtered(); track assignment.id) {
                <tr>
                  <td>
                    <p class="font-medium text-ink">{{ assignment.title }}</p>
                    @if (assignment.teacher; as teacher) {
                      <p class="text-[11px] text-ink-3">{{ teacher.lastName }}</p>
                    }
                  </td>
                  <td>
                    @if (assignment.program; as program) {
                      <span class="inline-flex items-center gap-1.5">
                        <span
                          class="h-2 w-2 shrink-0 rounded-full"
                          [style.background]="program.color || 'var(--accent)'"
                        ></span>
                        {{ program.name }}
                      </span>
                    } @else {
                      <span class="text-ink-3">—</span>
                    }
                  </td>
                  <td class="whitespace-nowrap">{{ format.date(assignment.assignedOn) }}</td>
                  <td class="whitespace-nowrap">
                    @if (assignment.dueAt) {
                      {{ format.date(assignment.dueAt) }}
                    } @else {
                      <span class="text-ink-3">—</span>
                    }
                  </td>
                  <td><app-status-badge [status]="assignment.status" /></td>
                  <td class="text-right tabular-nums">
                    {{ (assignment.gradedCount ?? 0) + '/' + (assignment.targetCount ?? 0) }}
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn-ghost btn-icon-sm"
                      (click)="openDetail(assignment)"
                      [attr.aria-label]="'assignments.manage' | transloco"
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

    <!-- Create drawer -->
    <app-drawer
      [open]="createOpen()"
      title="assignments.create.title"
      subtitle="assignments.create.hint"
      size="md"
      [showFooter]="true"
      (closed)="createOpen.set(false)"
    >
      <form [formGroup]="createForm" class="space-y-4" (ngSubmit)="submitCreate()">
        <label class="field">
          <span class="field-label">{{ 'assignments.form.title' | transloco }}</span>
          <input name="title" class="input" formControlName="title" maxlength="200" autocomplete="off" />
        </label>
        <label class="field">
          <span class="field-label">{{ 'assignments.form.description' | transloco }}</span>
          <textarea name="description" class="input min-h-24" formControlName="description" maxlength="5000"></textarea>
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="field">
            <span class="field-label">{{ 'assignments.form.program' | transloco }}</span>
            <select name="programId" class="input" formControlName="programId">
              <option value="">{{ 'common.none' | transloco }}</option>
              @for (program of options()?.programs ?? []; track program.id) {
                <option [value]="program.id">{{ program.name }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'assignments.form.due' | transloco }}</span>
            <input name="dueAt" class="input" type="datetime-local" formControlName="dueAt" autocomplete="off" />
          </label>
        </div>
        <div class="field">
          <span class="field-label">{{ 'assignments.form.students' | transloco }}</span>
          <div class="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
            @for (student of students(); track student.id) {
              <label class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2">
                <input name="student"
                  type="checkbox"
                  class="accent-accent"
                  [checked]="isSelected(student.id)"
                  (change)="toggleStudent(student.id)" autocomplete="off" />
                <span>{{ student.lastName }} {{ student.firstName }}</span>
                <span class="ml-auto text-[11px] text-ink-3 tabular-nums">{{ student.registrationNumber }}</span>
              </label>
            }
          </div>
          @if (createForm.controls.title.touched && createForm.controls.title.invalid) {
            <p class="mt-1 text-[12px] text-danger">{{ 'common.requiredField' | transloco }}</p>
          }
        </div>
        <div class="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" class="btn" (click)="createOpen.set(false)">
            {{ 'common.cancel' | transloco }}
          </button>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ 'common.save' | transloco }}
          </button>
        </div>
      </form>
    </app-drawer>

    <!-- Detail drawer: targets + grading -->
    <app-drawer
      [open]="detailOpen()"
      [title]="detailTitle()"
      subtitle="assignments.detail.hint"
      size="lg"
      (closed)="detailOpen.set(false)"
    >
      @if (detail(); as assignment) {
        <div class="space-y-4">
          @if (assignment.description; as description) {
            <p class="rounded-xl bg-surface-2 p-3 text-[13px] text-ink-2">{{ description }}</p>
          }
          <div class="flex items-center gap-3">
            <app-status-badge [status]="assignment.status" />
            @if (assignment.dueAt) {
              <span class="text-[12px] text-ink-3">{{ 'assignments.detail.due' | transloco }}: {{ format.date(assignment.dueAt) }}</span>
            }
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>{{ 'assignments.columns.student' | transloco }}</th>
                  <th>{{ 'assignments.detail.state' | transloco }}</th>
                  <th class="w-24">{{ 'assignments.detail.grade' | transloco }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.studentId) {
                  <tr>
                    <td>
                      <p class="text-[13px] font-medium text-ink">{{ row.name }}</p>
                      <p class="text-[11px] text-ink-3 tabular-nums">{{ row.registrationNumber }}</p>
                    </td>
                    <td>
                      @switch (row.state) {
                        @case ('pending') {
                          <span class="badge badge-neutral">{{ 'assignments.state.pending' | transloco }}</span>
                        }
                        @case ('submitted') {
                          <span class="badge badge-info">{{ 'assignments.state.submitted' | transloco }}</span>
                        }
                        @case ('graded') {
                          <span class="badge badge-success">{{ 'assignments.state.graded' | transloco }}</span>
                        }
                      }
                    </td>
                    <td class="tabular-nums">
                      @if (row.submission?.grade !== null && row.submission?.grade !== undefined) {
                        {{ row.submission!.grade }}
                      } @else {
                        —
                      }
                    </td>
                    <td class="text-right">
                      @if (row.submission; as submission) {
                        @if (submission.status !== 'GRADED') {
                          <button type="button" class="btn btn-sm btn-primary" (click)="gradeRow(row)">
                            {{ 'assignments.grade' | transloco }}
                          </button>
                        } @else {
                          <span class="text-[11px] text-ink-3">
                            {{ submission.gradedAt ? format.date(submission.gradedAt) : '' }}
                          </span>
                        }
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (selectedRow(); as row) {
            <form [formGroup]="gradeForm" class="space-y-3 rounded-xl border border-line bg-surface-2 p-4" (ngSubmit)="submitGrade(row)">
              <p class="text-[13px] font-semibold text-ink">
                {{ 'assignments.gradeFor' | transloco: { name: row.name } }}
              </p>
              @if (row.submission?.content; as content) {
                <p class="rounded-lg bg-surface p-3 text-[13px] text-ink-2">{{ content }}</p>
              }
              <div class="grid gap-3 sm:grid-cols-[120px_1fr]">
                <label class="field">
                  <span class="field-label">{{ 'assignments.detail.grade' | transloco }}</span>
                  <input name="grade" class="input" type="number" min="0" max="100" formControlName="grade" autocomplete="off" />
                </label>
                <label class="field">
                  <span class="field-label">{{ 'assignments.form.feedback' | transloco }}</span>
                  <input name="feedback" class="input" formControlName="feedback" maxlength="4000" autocomplete="off" />
                </label>
              </div>
              <div class="flex justify-end">
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ 'assignments.saveGrade' | transloco }}
                </button>
              </div>
            </form>
          }
        </div>
      }
    </app-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignmentsPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  readonly format = inject(FormatService);

  readonly assignments = signal<Assignment[]>([]);
  readonly students = signal<Student[]>([]);
  readonly options = signal<AcademicsOptions | null>(null);
  readonly loading = signal(true);
  readonly filter = signal<AssignmentFilter>('all');
  readonly createOpen = signal(false);
  readonly saving = signal(false);
  readonly detailOpen = signal(false);
  readonly detail = signal<Assignment | null>(null);
  readonly rows = signal<TargetRow[]>([]);
  readonly selectedRow = signal<TargetRow | null>(null);

  readonly selectedIds = signal<Set<string>>(new Set());

  readonly createForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: [''],
    programId: [''],
    dueAt: [''],
  });
  readonly gradeForm = this.fb.nonNullable.group({
    grade: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    feedback: [''],
  });

  readonly filtered = computed(() => {
    const assignments = this.assignments();
    const filter = this.filter();
    if (filter === 'all') return assignments;
    return assignments.filter((assignment) =>
      filter === 'open' ? assignment.status === 'ACTIVE' : assignment.status !== 'ACTIVE',
    );
  });

  readonly filterTabs = computed(() => {
    const assignments = this.assignments();
    const open = assignments.filter((a) => a.status === 'ACTIVE').length;
    return [
      { value: 'all' as AssignmentFilter, key: 'assignments.all', count: assignments.length },
      { value: 'open' as AssignmentFilter, key: 'assignments.open', count: open },
      {
        value: 'closed' as AssignmentFilter,
        key: 'assignments.closed',
        count: assignments.length - open,
      },
    ];
  });

  readonly detailTitle = computed(() => {
    const assignment = this.detail();
    return assignment ? `assignments.detail.title` : 'assignments.title';
  });

  constructor() {
    void this.load();
  }

  isSelected(studentId: string): boolean {
    return this.selectedIds().has(studentId);
  }

  toggleStudent(studentId: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(studentId)) {
      next.delete(studentId);
    } else {
      next.add(studentId);
    }
    this.selectedIds.set(next);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(this.api.list<Assignment>('/assignments'));
      this.assignments.set((response as { data: Assignment[] }).data ?? []);
    } catch {
      this.assignments.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async openCreate(): Promise<void> {
    this.selectedIds.set(new Set());
    this.createForm.reset({ title: '', description: '', programId: '', dueAt: '' });
    this.createOpen.set(true);
    if (!this.students().length) {
      try {
        const [options, students] = await Promise.all([
          firstValueFrom(this.api.get<AcademicsOptions>('/academics/options')),
          firstValueFrom(
            this.api.list<Student>('/students', { status: 'ACTIVE', pageSize: 200 }),
          ),
        ]);
        this.options.set(options);
        this.students.set((students as { data: Student[] }).data ?? []);
      } catch {
        this.toast.error('assignments.loadError');
      }
    }
  }

  async submitCreate(): Promise<void> {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    if (this.selectedIds().size === 0) {
      this.toast.error('assignments.studentsRequired');
      return;
    }
    if (this.saving()) return;
    this.saving.set(true);
    const value = this.createForm.getRawValue();
    try {
      await firstValueFrom(
        this.api.post<Assignment>('/assignments', {
          title: value.title.trim(),
          description: value.description.trim() || undefined,
          programId: value.programId || undefined,
          dueAt: value.dueAt ? new Date(value.dueAt).toISOString() : undefined,
          assignedOn: new Date().toISOString().slice(0, 10),
          studentIds: [...this.selectedIds()],
        }),
      );
      this.toast.success('assignments.created');
      this.createOpen.set(false);
      await this.load();
    } catch {
      this.toast.error('assignments.saveError');
    } finally {
      this.saving.set(false);
    }
  }

  async openDetail(assignment: Assignment): Promise<void> {
    this.detailOpen.set(true);
    this.selectedRow.set(null);
    try {
      const detail = await firstValueFrom(
        this.api.get<Assignment>(`/assignments/${assignment.id}`),
      );
      this.detail.set(detail);
      this.rebuildRows(detail);
    } catch {
      this.toast.error('assignments.loadError');
    }
  }

  gradeRow(row: TargetRow): void {
    this.gradeForm.reset({ grade: row.submission?.grade ?? 0, feedback: '' });
    this.selectedRow.set(row);
  }

  async submitGrade(row: TargetRow): Promise<void> {
    if (this.gradeForm.invalid) {
      this.gradeForm.markAllAsTouched();
      return;
    }
    const submission = row.submission;
    if (!submission) return;
    if (this.saving()) return;
    this.saving.set(true);
    const value = this.gradeForm.getRawValue();
    try {
      await firstValueFrom(
        this.api.post(
          `/assignments/${this.detail()!.id}/submissions/${submission.id}/grade`,
          { grade: value.grade, feedback: value.feedback.trim() || undefined },
        ),
      );
      this.toast.success('assignments.graded');
      const assignment = this.detail();
      if (assignment) await this.openDetail(assignment);
      await this.load();
    } catch {
      this.toast.error('assignments.saveError');
    } finally {
      this.saving.set(false);
    }
  }

  private rebuildRows(detail: Assignment): void {
    const byStudent = new Map((detail.submissions ?? []).map((s) => [s.student?.id, s]));
    const rows: TargetRow[] = (detail.targets ?? []).map((target) => {
      const submission = byStudent.get(target.student.id) ?? null;
      const state: SubmissionState = !submission?.submittedAt
        ? 'pending'
        : submission.status === 'GRADED'
          ? 'graded'
          : 'submitted';
      return {
        studentId: target.student.id,
        name: `${target.student.lastName} ${target.student.firstName}`,
        registrationNumber: target.student.registrationNumber,
        state,
        submission,
      };
    });
    this.rows.set(rows);
  }
}
