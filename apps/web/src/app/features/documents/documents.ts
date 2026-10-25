import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { saveBlob } from '../../core/download';
import { FormatService } from '../../core/format.service';
import type {
  DocumentRecord,
  DocumentStatus,
  DocumentTemplate,
  DocumentType,
  DocumentsStats,
  Exam,
  Student,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

const DOCUMENT_TYPES: DocumentType[] = [
  'REGISTRATION_FORM',
  'ATTENDANCE_CERTIFICATE',
  'GRADE_TRANSCRIPT',
  'DIPLOMA',
  'CERTIFICATE',
  'EXAM_RECORD',
  'OTHER',
];

const ISSUE_TYPES: DocumentType[] = [...DOCUMENT_TYPES];

const DOCUMENT_STATUSES: DocumentStatus[] = ['DRAFT', 'ISSUED', 'ARCHIVED'];

@Component({
  selector: 'app-documents-page',
  imports: [SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="documents.title" subtitle="documents.subtitle">
        @if (canWrite()) {
          <button type="button" class="btn btn-primary" (click)="openComposer()">
            <app-icon name="plus" [size]="16" />
            {{ 'documents.issue' | transloco }}
          </button>
        }
      </app-page-header>

      @if (loadingStats()) {
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          @for (row of [1, 2, 3, 4, 5, 6]; track row) {
            <div class="card p-5">
              <div class="skeleton h-3 w-20"></div>
              <div class="skeleton mt-3 h-7 w-16"></div>
            </div>
          }
        </div>
      } @else if (stats(); as data) {
        <div class="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <app-stat-card
            label="documents.stats.total"
            [value]="format.number(data.total)"
            icon="folder"
            tone="accent"
          />
          <app-stat-card
            label="documents.stats.issued"
            [value]="format.number(data.issued)"
            icon="badge-check"
            tone="success"
          />
          <app-stat-card
            label="documents.stats.draft"
            [value]="format.number(data.draft)"
            icon="file-text"
            tone="warning"
          />
          <div class="card p-5">
            <div class="flex items-start justify-between gap-3">
              <p class="text-[12px] font-medium text-ink-3">
                {{ 'documents.stats.coverage' | transloco }}
              </p>
              <span
                class="flex h-8 w-8 items-center justify-center rounded-lg border border-info/20 bg-info-soft text-info"
              >
                <app-icon name="percent" [size]="15" />
              </span>
            </div>
            <p class="mt-2.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums">
              {{ format.percent(data.coverage) }}
            </p>
            <div class="mt-3">
              <app-progress [value]="data.coverage" [tone]="coverageTone()" />
            </div>
          </div>
          <app-stat-card
            label="documents.stats.documented"
            [value]="format.number(data.documentedStudents)"
            icon="users"
            tone="info"
          />
          <app-stat-card
            label="documents.stats.studentsWithout"
            [value]="format.number(data.studentsWithoutDocuments)"
            icon="user"
            tone="danger"
          />
        </div>
      }

      <form class="card my-4 p-4" [formGroup]="filters">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label class="field">
            <span class="field-label">{{ 'common.search' | transloco }}</span>
            <div class="relative">
              <app-icon
                name="search"
                [size]="15"
                class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
              />
              <input name="search"
                type="search"
                class="input pl-9"
                formControlName="search"
                [attr.placeholder]="'documents.searchPlaceholder' | transloco" autocomplete="off" />
            </div>
          </label>
          <label class="field">
            <span class="field-label">{{ 'documents.typeFilter' | transloco }}</span>
            <select name="type" class="select" formControlName="type">
              <option value="">{{ 'common.all' | transloco }}</option>
              @for (type of documentTypes; track type) {
                <option [value]="type">
                  {{ ('documentType.' + type) | transloco }}
                </option>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'common.status' | transloco }}</span>
            <select name="status" class="select" formControlName="status">
              <option value="">{{ 'common.allStatuses' | transloco }}</option>
              @for (status of documentStatuses; track status) {
                <option [value]="status">{{ ('status.' + status) | transloco }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'documents.studentFilter' | transloco }}</span>
            <select name="studentId" class="select" formControlName="studentId">
              <option value="">{{ 'common.all' | transloco }}</option>
              @for (student of students(); track student.id) {
                <option [value]="student.id">
                  {{ student.lastName }} {{ student.firstName }}
                </option>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'documents.examFilter' | transloco }}</span>
            <select name="examId" class="select" formControlName="examId">
              <option value="">{{ 'common.all' | transloco }}</option>
              @for (exam of exams(); track exam.id) {
                <option [value]="exam.id">{{ exam.title }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'documents.fromFilter' | transloco }}</span>
            <input name="from" type="date" class="input" formControlName="from" autocomplete="off" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'documents.toFilter' | transloco }}</span>
            <input name="to" type="date" class="input" formControlName="to" autocomplete="off" />
          </label>
        </div>
      </form>

      <section class="card overflow-hidden">
        @if (loading()) {
          <div class="space-y-3 p-5">
            @for (row of [1, 2, 3, 4, 5, 6]; track row) {
              <div class="flex items-center gap-4">
                <div class="skeleton h-8 w-8 rounded-lg"></div>
                <div class="skeleton h-4 w-48"></div>
                <div class="skeleton h-4 w-32"></div>
                <div class="skeleton h-4 flex-1"></div>
                <div class="skeleton h-5 w-16"></div>
              </div>
            }
          </div>
        } @else if (documents().length === 0) {
          <app-empty-state title="documents.empty" message="documents.emptyHint" icon="folder" />
        } @else {
          <div class="table-wrap rounded-none border-0 shadow-none">
            <table class="table min-w-[1040px]">
              <thead>
                <tr>
                  <th>{{ 'documents.columns.title' | transloco }}</th>
                  <th>{{ 'documents.columns.student' | transloco }}</th>
                  <th>{{ 'documents.columns.type' | transloco }}</th>
                  <th>{{ 'documents.columns.reference' | transloco }}</th>
                  <th>{{ 'documents.columns.issuedAt' | transloco }}</th>
                  <th>{{ 'documents.columns.status' | transloco }}</th>
                  <th>{{ 'documents.columns.file' | transloco }}</th>
                  <th class="w-24"></th>
                </tr>
              </thead>
              <tbody>
                @for (document of documents(); track document.id) {
                  <tr>
                    <td>
                      <div class="flex items-center gap-2.5">
                        <span
                          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-3"
                        >
                          <app-icon name="file-text" [size]="15" />
                        </span>
                        <span class="font-medium text-ink">{{ document.title }}</span>
                      </div>
                    </td>
                    <td>
                      @if (document.student; as student) {
                        <div class="flex items-center gap-2.5">
                          <app-avatar
                            [firstName]="student.firstName"
                            [lastName]="student.lastName"
                            [size]="30"
                          />
                          <div class="min-w-0">
                            <p class="truncate font-medium text-ink">
                              {{ student.firstName }} {{ student.lastName }}
                            </p>
                            <p class="text-[11px] text-ink-3">
                              {{ student.registrationNumber }}
                            </p>
                          </div>
                        </div>
                      } @else if (document.exam; as exam) {
                        <div class="flex items-center gap-2.5">
                          <span class="icon-box h-[30px] w-[30px]">
                            <app-icon name="award" [size]="14" />
                          </span>
                          <div class="min-w-0">
                            <p class="truncate font-medium text-ink">{{ exam.title }}</p>
                            <p class="text-[11px] text-ink-3">
                              {{ 'documents.examRecord' | transloco }}
                            </p>
                          </div>
                        </div>
                      } @else {
                        <span class="text-ink-3">—</span>
                      }
                    </td>
                    <td>{{ ('documentType.' + document.type) | transloco }}</td>
                    <td class="whitespace-nowrap font-mono text-[12px]">
                      {{ document.protocolNumber || document.referenceNumber || ('documents.noReference' | transloco) }}
                    </td>
                    <td class="whitespace-nowrap">{{ format.date(document.issuedAt) }}</td>
                    <td><app-status-badge [status]="document.status" /></td>
                    <td>
                      @if (document.fileName) {
                        <span class="inline-flex max-w-[200px] items-center gap-1.5 text-ink-2">
                          <app-icon name="file-text" [size]="14" />
                          <span class="truncate">{{ document.fileName }}</span>
                        </span>
                      } @else {
                        <span class="inline-flex items-center gap-1.5 text-ink-3">
                          <app-icon name="file-text" [size]="14" />
                          {{ 'documents.noFile' | transloco }}
                        </span>
                      }
                    </td>
                    <td>
                      <div class="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          class="btn-ghost btn-icon-sm"
                          [disabled]="downloadingId() === document.id"
                          (click)="download(document)"
                          [attr.aria-label]="'documents.download' | transloco"
                        >
                          <app-icon name="download" [size]="15" />
                        </button>
                        @if (canWrite() && document.status === 'DRAFT') {
                          <button
                            type="button"
                            class="btn-ghost btn-icon-sm"
                            [disabled]="busyId() === document.id"
                            (click)="issueDraft(document)"
                            [attr.aria-label]="'documents.issueNow' | transloco"
                          >
                            <app-icon name="badge-check" [size]="15" />
                          </button>
                        }
                        @if (canWrite() && document.status === 'ISSUED' && !document.approvedAt) {
                          <button
                            type="button"
                            class="btn-ghost btn-icon-sm"
                            [disabled]="busyId() === document.id"
                            (click)="approve(document)"
                            [attr.aria-label]="'documents.approve' | transloco"
                            [attr.title]="'documents.approve' | transloco"
                          >
                            <app-icon name="check" [size]="15" />
                          </button>
                        }
                        @if (canWrite() && document.status !== 'ARCHIVED') {
                          <button
                            type="button"
                            class="btn-ghost btn-icon-sm"
                            [disabled]="busyId() === document.id"
                            (click)="archive(document)"
                            [attr.aria-label]="'documents.archive.action' | transloco"
                          >
                            <app-icon name="folder" [size]="15" />
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="px-4">
            <app-pagination
              [page]="page()"
              [pageSize]="pageSize"
              [total]="total()"
              (pageChange)="goPage($event)"
            />
          </div>
        }
      </section>
    </div>

    <app-drawer
      [open]="drawerOpen()"
      title="documents.issueDrawer.title"
      subtitle="documents.issueDrawer.hint"
      size="md"
      [showFooter]="true"
      (closed)="drawerOpen.set(false)"
    >
      <form [formGroup]="form" class="space-y-4" (ngSubmit)="submit()">
        @if (isExamRecord()) {
          <label class="field">
            <span class="field-label">{{ 'documents.issueDrawer.exam' | transloco }}</span>
            <select name="examId" class="select" formControlName="examId">
              <option value="">{{ 'common.all' | transloco }}</option>
              @for (exam of exams(); track exam.id) {
                <option [value]="exam.id">{{ exam.title }}</option>
              }
            </select>
          </label>
          <p class="text-[12px] leading-relaxed text-ink-3">
            {{ 'documents.issueDrawer.examHint' | transloco }}
          </p>
        } @else {
          <label class="field">
            <span class="field-label">{{ 'documents.issueDrawer.student' | transloco }}</span>
            <select name="studentId" class="select" formControlName="studentId">
              <option value="">{{ 'finance.form.selectStudent' | transloco }}</option>
              @for (student of students(); track student.id) {
                <option [value]="student.id">
                  {{ student.lastName }} {{ student.firstName }} · {{ student.registrationNumber }}
                </option>
              }
            </select>
          </label>
        }
        <label class="field">
          <span class="field-label">{{ 'documents.issueDrawer.type' | transloco }}</span>
          <select name="type" class="select" formControlName="type" (change)="onTypeChange()">
            @for (type of issueTypes; track type) {
              <option [value]="type">{{ ('documentType.' + type) | transloco }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span class="field-label">{{ 'documents.issueDrawer.template' | transloco }}</span>
          <select name="templateKey" class="select" formControlName="templateKey">
            @for (template of templatesForType(); track template.key) {
              <option [value]="template.key">{{ template.title }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span class="field-label">{{ 'documents.issueDrawer.title' | transloco }}</span>
          <input name="title" class="input" formControlName="title" maxlength="200" autocomplete="off" />
        </label>
        <label class="field">
          <span class="field-label">{{ 'common.notes' | transloco }}</span>
          <textarea name="notes" class="textarea" rows="3" formControlName="notes" maxlength="2000"></textarea>
        </label>
        <label class="flex items-center gap-2 text-[13px] text-ink-2">
          <input name="draft" type="checkbox" formControlName="draft" autocomplete="off" />
          {{ 'documents.issueDrawer.draft' | transloco }}
        </label>
        <p class="text-[12px] leading-relaxed text-ink-3">
          {{ 'documents.issueDrawer.legalHint' | transloco }}
        </p>
        <div drawer-footer class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" (click)="drawerOpen.set(false)">
            {{ 'common.cancel' | transloco }}
          </button>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ (saving() ? 'common.saving' : 'documents.issueDrawer.submit') | transloco }}
          </button>
        </div>
      </form>
    </app-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentsPage {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly format = inject(FormatService);

  readonly documentTypes = DOCUMENT_TYPES;
  readonly documentStatuses = DOCUMENT_STATUSES;
  readonly issueTypes = ISSUE_TYPES;

  readonly filters = this.fb.nonNullable.group({
    search: '',
    type: '',
    status: '',
    studentId: '',
    examId: '',
    from: '',
    to: '',
  });

  readonly form = this.fb.nonNullable.group({
    studentId: ['', Validators.required],
    examId: [''],
    type: ['CERTIFICATE' as DocumentType, Validators.required],
    templateKey: ['', Validators.required],
    title: [''],
    notes: [''],
    draft: [false],
  });

  readonly stats = signal<DocumentsStats | null>(null);
  readonly loadingStats = signal(true);
  readonly documents = signal<DocumentRecord[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly page = signal(1);
  readonly pageSize = 20;
  readonly drawerOpen = signal(false);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly downloadingId = signal<string | null>(null);
  readonly templates = signal<DocumentTemplate[]>([]);
  readonly students = signal<Student[]>([]);
  readonly exams = signal<Exam[]>([]);

  readonly canWrite = computed(() => this.auth.has('documents.write'));

  readonly isExamRecord = signal(false);

  readonly coverageTone = computed<'success' | 'warning' | 'danger'>(() => {
    const coverage = this.stats()?.coverage ?? 0;
    if (coverage >= 80) return 'success';
    if (coverage >= 50) return 'warning';
    return 'danger';
  });

  readonly templatesForType = computed(() =>
    this.templates().filter((template) => template.type === this.form.controls.type.value),
  );

  private loadSeq = 0;

  constructor() {
    this.filters.controls.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => {
        this.page.set(1);
        void this.loadDocuments();
      });

    for (const control of [
      this.filters.controls.type,
      this.filters.controls.status,
      this.filters.controls.studentId,
      this.filters.controls.examId,
      this.filters.controls.from,
      this.filters.controls.to,
    ] as const) {
      control.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
        this.page.set(1);
        void this.loadDocuments();
      });
    }

    void this.loadStats();
    void this.loadDocuments();
    void this.loadStudents();
    void this.loadExams();
    if (this.canWrite()) {
      void this.loadTemplates();
    }
  }

  goPage(page: number): void {
    this.page.set(page);
    void this.loadDocuments();
  }

  async openComposer(): Promise<void> {
    if (!this.canWrite()) return;
    this.form.reset({
      studentId: '',
      examId: '',
      type: 'CERTIFICATE',
      templateKey: this.defaultTemplate('CERTIFICATE'),
      title: '',
      notes: '',
      draft: false,
    });
    this.syncComposerValidators('CERTIFICATE');
    this.drawerOpen.set(true);
    if (!this.templates().length) await this.loadTemplates();
    if (!this.exams().length) await this.loadExams();
  }

  onTypeChange(): void {
    const type = this.form.controls.type.value;
    this.form.controls.templateKey.setValue(this.defaultTemplate(type));
    this.syncComposerValidators(type);
  }

  private syncComposerValidators(type: DocumentType): void {
    const examRecord = type === 'EXAM_RECORD';
    this.isExamRecord.set(examRecord);
    const student = this.form.controls.studentId;
    const exam = this.form.controls.examId;
    if (examRecord) {
      student.clearValidators();
      student.setValue('');
      exam.setValidators(Validators.required);
    } else {
      exam.clearValidators();
      exam.setValue('');
      student.setValidators(Validators.required);
    }
    student.updateValueAndValidity({ emitEvent: false });
    exam.updateValueAndValidity({ emitEvent: false });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.saving()) return;
    this.saving.set(true);
    const value = this.form.getRawValue();
    try {
      const document = await firstValueFrom(
        this.api.post<DocumentRecord>('/documents', {
          studentId: value.studentId || undefined,
          examId: value.examId || undefined,
          type: value.type,
          templateKey: value.templateKey,
          title: value.title.trim() || undefined,
          notes: value.notes.trim() || undefined,
          draft: value.draft,
        }),
      );
      this.toast.success(
        this.transloco.translate(
          document.status === 'ISSUED'
            ? 'documents.toasts.issued'
            : 'documents.toasts.draftSaved',
          { protocol: document.protocolNumber ?? '—' },
        ),
      );
      this.drawerOpen.set(false);
      this.page.set(1);
      await Promise.all([this.loadStats(), this.loadDocuments()]);
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.saving.set(false);
    }
  }

  async issueDraft(document: DocumentRecord): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(document.id);
    try {
      const issued = await firstValueFrom(
        this.api.post<DocumentRecord>(`/documents/${document.id}/issue`),
      );
      this.toast.success(
        this.transloco.translate('documents.toasts.issued', {
          protocol: issued.protocolNumber ?? '—',
        }),
      );
      await Promise.all([this.loadStats(), this.loadDocuments()]);
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.busyId.set(null);
    }
  }

  async approve(document: DocumentRecord): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(document.id);
    try {
      await firstValueFrom(this.api.post(`/documents/${document.id}/approve`));
      this.toast.success(this.transloco.translate('documents.toasts.approved'));
      await Promise.all([this.loadStats(), this.loadDocuments()]);
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.busyId.set(null);
    }
  }

  async archive(document: DocumentRecord): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.transloco.translate('documents.archive.title'),
      message: this.transloco.translate('documents.archive.message', { title: document.title }),
      confirmLabel: this.transloco.translate('documents.archive.action'),
      cancelLabel: this.transloco.translate('common.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    this.busyId.set(document.id);
    try {
      await firstValueFrom(this.api.post(`/documents/${document.id}/archive`, {}));
      this.toast.success(this.transloco.translate('documents.toasts.archived'));
      await Promise.all([this.loadStats(), this.loadDocuments()]);
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.busyId.set(null);
    }
  }

  async download(document: DocumentRecord): Promise<void> {
    if (this.downloadingId()) return;
    this.downloadingId.set(document.id);
    try {
      const blob = await firstValueFrom(this.api.blob(`/documents/${document.id}/pdf`));
      saveBlob(blob, document.fileName ?? `document-${document.id}.pdf`);
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.downloadingId.set(null);
    }
  }

  private defaultTemplate(type: DocumentType): string {
    const candidates = this.templates().filter((template) => template.type === type);
    return candidates.find((template) => template.default)?.key ?? candidates[0]?.key ?? '';
  }

  private async loadTemplates(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.api.get<{ data: DocumentTemplate[] }>('/documents/templates'),
      );
      this.templates.set(response.data);
      if (!this.form.controls.templateKey.value) {
        this.form.controls.templateKey.setValue(
          this.defaultTemplate(this.form.controls.type.value),
        );
      }
    } catch {
      this.templates.set([]);
    }
  }

  private async loadStudents(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.api.list<Student>('/students', { pageSize: 100, status: 'ACTIVE' }),
      );
      this.students.set(response.data);
    } catch {
      this.students.set([]);
    }
  }

  private async loadExams(): Promise<void> {
    try {
      const response = await firstValueFrom(this.api.list<Exam>('/exams'));
      this.exams.set(response.data);
    } catch {
      this.exams.set([]);
    }
  }

  private async loadStats(): Promise<void> {
    this.loadingStats.set(true);
    try {
      const stats = await firstValueFrom(this.api.get<DocumentsStats>('/documents/stats'));
      this.stats.set(stats);
    } catch {
      this.stats.set(null);
    } finally {
      this.loadingStats.set(false);
    }
  }

  private async loadDocuments(): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    const filters = this.filters.getRawValue();
    try {
      const response = await firstValueFrom(
        this.api.list<DocumentRecord>('/documents', {
          page: this.page(),
          pageSize: this.pageSize,
          search: filters.search.trim() || undefined,
          type: filters.type ? (filters.type as DocumentType) : undefined,
          status: filters.status ? (filters.status as DocumentStatus) : undefined,
          studentId: filters.studentId || undefined,
          examId: filters.examId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
        }),
      );
      if (seq !== this.loadSeq) return;
      this.documents.set(response.data);
      this.total.set(response.meta?.total ?? response.data.length);
    } catch {
      if (seq === this.loadSeq) {
        this.documents.set([]);
        this.total.set(0);
      }
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }
}
