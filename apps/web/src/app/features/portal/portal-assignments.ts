import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FormatService } from '../../core/format.service';
import type { PortalAssignment } from '../../core/models';
import { PortalContextService } from '../../core/portal-context.service';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';
import { PortalChildSelectorComponent } from './portal-child-selector';

@Component({
  selector: 'app-portal-assignments',
  imports: [SHARED_IMPORTS, ReactiveFormsModule, PortalChildSelectorComponent],
  template: `
    <div class="page">
      <app-page-header
        eyebrow="portal.eyebrow"
        title="portal.assignments.title"
        subtitle="portal.assignments.subtitle"
      />
      <app-portal-child-selector (changed)="reload()" />

      @if (loading()) {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          @for (item of skeletons; track item) {
            <div class="skeleton h-52 rounded-2xl"></div>
          }
        </div>
      } @else if (assignments().length === 0) {
        <div class="card">
          <app-empty-state title="portal.assignments.empty" icon="book" />
        </div>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          @for (assignment of assignments(); track assignment.id) {
            <article class="card relative overflow-hidden">
              <span class="absolute inset-x-0 top-0 h-[3px]" [style.background]="assignment.program?.color || 'var(--accent)'"></span>
              <div class="card-pad">
                <div class="flex items-start justify-between gap-3">
                  <span class="icon-box"><app-icon name="book" [size]="18" /></span>
                  @switch (stateOf(assignment)) {
                    @case ('graded') {
                      <span class="badge badge-success">{{ 'portal.assignments.state.graded' | transloco }}</span>
                    }
                    @case ('submitted') {
                      <span class="badge badge-info">{{ 'portal.assignments.state.submitted' | transloco }}</span>
                    }
                    @default {
                      <span class="badge badge-neutral">{{ 'portal.assignments.state.pending' | transloco }}</span>
                    }
                  }
                </div>
                <h2 class="mt-4 text-[15px] font-semibold leading-snug">{{ assignment.title }}</h2>
                <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
                  @if (assignment.program?.name; as program) {
                    <span>{{ program }}</span>
                  }
                  @if (assignment.teacher; as teacher) {
                    <span class="text-line-strong">·</span>
                    <span>{{ teacher.lastName }} {{ teacher.firstName }}</span>
                  }
                </div>
                @if (assignment.description; as description) {
                  <p class="mt-2 line-clamp-2 text-[12.5px] text-ink-2">{{ description }}</p>
                }
                <div class="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
                  <div>
                    <p class="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                      {{ 'portal.assignments.due' | transloco }}
                    </p>
                    <p class="mt-1 text-[11.5px] text-ink-2">
                      {{ assignment.dueAt ? format.date(assignment.dueAt) : '—' }}
                    </p>
                  </div>
                  @if (stateOf(assignment) !== 'graded') {
                    <button type="button" class="btn btn-sm btn-primary" (click)="openSubmit(assignment)">
                      {{ 'portal.assignments.submit' | transloco }}
                    </button>
                  } @else {
                    <span class="text-[24px] font-semibold leading-none text-accent-strong tabular-nums">
                      {{ assignment.submission?.grade }}
                    </span>
                  }
                </div>
                @if (assignment.submission?.feedback; as feedback) {
                  <p class="mt-3 rounded-lg bg-surface-2 p-2.5 text-[12px] text-ink-2">{{ feedback }}</p>
                }
              </div>
            </article>
          }
        </div>
      }
    </div>

    <app-drawer
      [open]="submitOpen()"
      title="portal.assignments.submitTitle"
      subtitle="portal.assignments.submitHint"
      size="md"
      [showFooter]="true"
      (closed)="submitOpen.set(false)"
    >
      <form [formGroup]="submitForm" class="space-y-4" (ngSubmit)="submitWork()">
        @if (submitting(); as assignment) {
          <p class="rounded-xl bg-surface-2 p-3 text-[13px] font-semibold text-ink">{{ assignment.title }}</p>
        }
        @if (submitting()?.submission?.content; as existing) {
          <p class="text-[12px] text-ink-3">{{ 'portal.assignments.previous' | transloco }}</p>
          <p class="rounded-lg bg-surface p-3 text-[13px] text-ink-2">{{ existing }}</p>
        }
        <label class="field">
          <span class="field-label">{{ 'portal.assignments.content' | transloco }}</span>
          <textarea name="content"
            class="input min-h-40"
            formControlName="content"
            maxlength="8000"
            [placeholder]="'portal.assignments.contentHint' | transloco"
          ></textarea>
          @if (submitForm.controls.content.touched && submitForm.controls.content.invalid) {
            <p class="mt-1 text-[12px] text-danger">{{ 'common.requiredField' | transloco }}</p>
          }
        </label>
        <div class="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" class="btn" (click)="submitOpen.set(false)">
            {{ 'common.cancel' | transloco }}
          </button>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ 'common.save' | transloco }}
          </button>
        </div>
      </form>
    </app-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalAssignmentsPage {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  readonly format = inject(FormatService);
  readonly portal = inject(PortalContextService);

  readonly assignments = signal<PortalAssignment[]>([]);
  readonly loading = signal(true);
  readonly skeletons = [1, 2, 3];
  readonly submitOpen = signal(false);
  readonly saving = signal(false);
  readonly submitting = signal<PortalAssignment | null>(null);
  readonly submitForm = this.fb.nonNullable.group({
    content: ['', [Validators.required, Validators.maxLength(8000)]],
  });

  constructor() {
    void this.portal.ensureLoaded().then(() => this.load());
  }
  reload(): void {
    void this.load();
  }
  stateOf(assignment: PortalAssignment): 'pending' | 'submitted' | 'graded' {
    const submission = assignment.submission;
    if (!submission || !submission.submittedAt) return 'pending';
    return submission.status === 'GRADED' ? 'graded' : 'submitted';
  }
  openSubmit(assignment: PortalAssignment): void {
    this.submitForm.reset({ content: assignment.submission?.content ?? '' });
    this.submitting.set(assignment);
    this.submitOpen.set(true);
  }
  async submitWork(): Promise<void> {
    const assignment = this.submitting();
    if (!assignment) return;
    if (this.submitForm.invalid) {
      this.submitForm.markAllAsTouched();
      return;
    }
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.api.post(`/assignments/${assignment.id}/submit`, {
          content: this.submitForm.getRawValue().content.trim(),
        }),
      );
      this.toast.success('portal.assignments.submitted');
      this.submitOpen.set(false);
      await this.load();
    } catch {
      this.toast.error('portal.assignments.submitError');
    } finally {
      this.saving.set(false);
    }
  }
  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(
        this.api.list<PortalAssignment>('/portal/assignments', this.portal.childParam()),
      );
      this.assignments.set((response as { data: PortalAssignment[] }).data ?? []);
    } catch {
      this.assignments.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
