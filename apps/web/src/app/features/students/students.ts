import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';
import type {
  AcademicsOptions,
  Enrollment,
  PageMeta,
  Student,
  StudentStatus,
} from '../../core/models';

interface CreateStudentPayload {
  firstName: string;
  lastName: string;
  branchId: string;
  status: StudentStatus;
  consentData: boolean;
  consentMedia: boolean;
  registrationNumber?: string;
  birthDate?: string;
  gender?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string;
}

@Component({
  selector: 'app-students-page',
  imports: [...SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="students.title" subtitle="students.subtitle">
        @if (canWrite()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <app-icon name="plus" [size]="16" />
            {{ 'students.new' | transloco }}
          </button>
        }
      </app-page-header>

      <div class="card card-pad mb-5">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="relative sm:col-span-2 lg:col-span-1">
            <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
              <app-icon name="search" [size]="15" />
            </span>
            <input name="search"
              type="search"
              class="input pl-9"
              [value]="search()"
              [placeholder]="'students.searchPlaceholder' | transloco"
              (input)="onSearchInput($event)"
              (keydown.enter)="onSearchEnter()" autocomplete="off" />
          </div>
          <select name="branch"
            class="select"
            [value]="branchId()"
            (change)="onBranchChange($event)"
            [attr.aria-label]="'students.columns.branch' | transloco"
          >
            <option value="">{{ 'common.allBranches' | transloco }}</option>
            @for (branch of options()?.branches ?? []; track branch.id) {
              <option [value]="branch.id">{{ branch.name }}</option>
            }
          </select>
          <select name="program"
            class="select"
            [value]="programId()"
            (change)="onProgramChange($event)"
            [attr.aria-label]="'students.columns.program' | transloco"
          >
            <option value="">{{ 'common.allPrograms' | transloco }}</option>
            @for (program of options()?.programs ?? []; track program.id) {
              <option [value]="program.id">{{ program.name }}</option>
            }
          </select>
          <select name="status"
            class="select"
            [value]="status()"
            (change)="onStatusChange($event)"
            [attr.aria-label]="'students.columns.status' | transloco"
          >
            <option value="">{{ 'common.allStatuses' | transloco }}</option>
            @for (option of statuses; track option) {
              <option [value]="option">{{ 'status.' + option | transloco }}</option>
            }
          </select>
        </div>
      </div>

      @if (loading()) {
        <div class="table-wrap hidden md:block">
          <table class="table">
            <thead>
              <tr>
                <th>{{ 'students.columns.student' | transloco }}</th>
                <th>{{ 'students.columns.registration' | transloco }}</th>
                <th>{{ 'students.columns.branch' | transloco }}</th>
                <th>{{ 'students.columns.program' | transloco }}</th>
                <th>{{ 'students.columns.teacher' | transloco }}</th>
                <th>{{ 'students.columns.guardians' | transloco }}</th>
                <th>{{ 'students.columns.status' | transloco }}</th>
                <th class="w-10"></th>
              </tr>
            </thead>
            <tbody>
              @for (row of skeletonRows; track row) {
                <tr>
                  <td>
                    <div class="flex items-center gap-3">
                      <div class="skeleton h-9 w-9 rounded-full"></div>
                      <div class="space-y-1.5">
                        <div class="skeleton h-3 w-32"></div>
                        <div class="skeleton h-2.5 w-40"></div>
                      </div>
                    </div>
                  </td>
                  <td><div class="skeleton h-3 w-20"></div></td>
                  <td><div class="skeleton h-3 w-24"></div></td>
                  <td><div class="skeleton h-3 w-28"></div></td>
                  <td><div class="skeleton h-3 w-24"></div></td>
                  <td><div class="skeleton h-3 w-6"></div></td>
                  <td><div class="skeleton h-5 w-16 rounded-full"></div></td>
                  <td></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="space-y-3 md:hidden">
          @for (row of skeletonRows; track row) {
            <div class="card card-pad">
              <div class="flex items-center gap-3">
                <div class="skeleton h-10 w-10 rounded-full"></div>
                <div class="flex-1 space-y-2">
                  <div class="skeleton h-3 w-36"></div>
                  <div class="skeleton h-2.5 w-24"></div>
                </div>
              </div>
            </div>
          }
        </div>
      } @else if (!data().length) {
        <div class="card">
          <app-empty-state
            title="students.emptyTitle"
            message="students.emptyMessage"
            icon="users"
          />
        </div>
      } @else {
        <div class="table-wrap hidden md:block">
          <table class="table">
            <thead>
              <tr>
                <th>{{ 'students.columns.student' | transloco }}</th>
                <th>{{ 'students.columns.registration' | transloco }}</th>
                <th>{{ 'students.columns.branch' | transloco }}</th>
                <th>{{ 'students.columns.program' | transloco }}</th>
                <th>{{ 'students.columns.teacher' | transloco }}</th>
                <th>{{ 'students.columns.guardians' | transloco }}</th>
                <th>{{ 'students.columns.status' | transloco }}</th>
                <th class="w-10"></th>
              </tr>
            </thead>
            <tbody>
              @for (student of data(); track student.id) {
                <tr
                  class="row-link"
                  tabindex="0"
                  (click)="openStudent(student.id)"
                  (keydown.enter)="openStudent(student.id)"
                >
                  <td>
                    <div class="flex items-center gap-3">
                      <app-avatar
                        [firstName]="student.firstName"
                        [lastName]="student.lastName"
                        [size]="36"
                      />
                      <div class="min-w-0">
                        <p class="truncate font-semibold text-ink">
                          {{ student.firstName }} {{ student.lastName }}
                        </p>
                        <p class="truncate text-[12px] text-ink-3">
                          {{ student.email || ('common.noneFound' | transloco) }}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td class="tabular-nums">{{ student.registrationNumber }}</td>
                  <td>{{ student.branch?.name || ('common.noneFound' | transloco) }}</td>
                  <td>
                    @if (activeEnrollment(student); as enrollment) {
                      <p class="font-medium text-ink">
                        {{ enrollment.program?.name || ('common.noneFound' | transloco) }}
                      </p>
                      @if (enrollment.level?.name) {
                        <p class="text-[12px] text-ink-3">{{ enrollment.level.name }}</p>
                      }
                    } @else {
                      <span class="text-ink-3">{{ 'students.noProgram' | transloco }}</span>
                    }
                  </td>
                  <td>
                    @if (activeEnrollment(student); as enrollment) {
                      @if (enrollment.teacher; as teacher) {
                        {{ teacher.firstName }} {{ teacher.lastName }}
                      } @else {
                        <span class="text-ink-3">{{ 'common.noneFound' | transloco }}</span>
                      }
                    } @else {
                      <span class="text-ink-3">{{ 'common.noneFound' | transloco }}</span>
                    }
                  </td>
                  <td class="tabular-nums">
                    {{
                      'students.guardiansCount'
                        | transloco: { count: student._count?.guardians ?? 0 }
                    }}
                  </td>
                  <td><app-status-badge [status]="student.status" /></td>
                  <td class="text-right">
                    <app-icon name="chevron-right" [size]="16" />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="space-y-3 md:hidden">
          @for (student of data(); track student.id) {
            <button
              type="button"
              class="card card-pad w-full text-left transition-colors hover:bg-surface-2"
              (click)="openStudent(student.id)"
            >
              <div class="flex items-start gap-3">
                <app-avatar
                  [firstName]="student.firstName"
                  [lastName]="student.lastName"
                  [size]="40"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <p class="truncate font-semibold text-ink">
                      {{ student.firstName }} {{ student.lastName }}
                    </p>
                    <app-status-badge [status]="student.status" />
                  </div>
                  <p class="mt-0.5 truncate text-[12px] text-ink-3">
                    {{ student.registrationNumber }} ·
                    {{ student.branch?.name || ('common.noneFound' | transloco) }}
                  </p>
                  <div class="mt-2 flex items-center justify-between gap-2 text-[12.5px]">
                    <span class="truncate text-ink-2">
                      @if (activeEnrollment(student); as enrollment) {
                        {{ enrollment.program?.name || ('students.noProgram' | transloco) }}
                      } @else {
                        {{ 'students.noProgram' | transloco }}
                      }
                    </span>
                    <span class="shrink-0 text-ink-3">
                      {{
                        'students.guardiansCount'
                          | transloco: { count: student._count?.guardians ?? 0 }
                      }}
                    </span>
                  </div>
                </div>
                <app-icon name="chevron-right" [size]="16" />
              </div>
            </button>
          }
        </div>

        <app-pagination
          [page]="page()"
          [pageSize]="pageSize()"
          [total]="meta()?.total ?? 0"
          (pageChange)="go($event)"
        />
      }
    </div>

    <app-drawer
      [open]="createOpen()"
      title="students.form.createTitle"
      [subtitle]="'students.form.createSubtitle' | transloco"
      size="lg"
      [showFooter]="true"
      (closed)="closeCreate()"
    >
      <form id="student-create-form" [formGroup]="form" (ngSubmit)="submit()" class="space-y-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="field">
            <span class="field-label">{{ 'students.form.firstName' | transloco }}</span>
            <input name="firstName" class="input" formControlName="firstName" autocomplete="given-name" />
            @if (form.controls.firstName.invalid && form.controls.firstName.touched) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.lastName' | transloco }}</span>
            <input name="lastName" class="input" formControlName="lastName" autocomplete="family-name" />
            @if (form.controls.lastName.invalid && form.controls.lastName.touched) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.branch' | transloco }}</span>
            <select name="branchId" class="select" formControlName="branchId">
              <option value="">{{ 'common.none' | transloco }}</option>
              @for (branch of options()?.branches ?? []; track branch.id) {
                <option [value]="branch.id">{{ branch.name }}</option>
              }
            </select>
            @if (form.controls.branchId.invalid && form.controls.branchId.touched) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.registrationNumber' | transloco }}</span>
            <input name="registrationNumber" class="input" formControlName="registrationNumber" autocomplete="off" />
            <span class="field-hint">{{ 'students.form.registrationHint' | transloco }}</span>
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.birthDate' | transloco }}</span>
            <input name="birthDate" class="input" type="date" formControlName="birthDate" autocomplete="off" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.gender' | transloco }}</span>
            <select name="gender" class="select" formControlName="gender">
              <option value="">{{ 'common.none' | transloco }}</option>
              <option value="male">{{ 'students.form.male' | transloco }}</option>
              <option value="female">{{ 'students.form.female' | transloco }}</option>
              <option value="other">{{ 'students.form.other' | transloco }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.email' | transloco }}</span>
            <input name="email" class="input" type="email" formControlName="email" autocomplete="email" />
            @if (form.controls.email.invalid && form.controls.email.touched) {
              <span class="field-error">{{ 'common.invalidEmail' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.phone' | transloco }}</span>
            <input name="phone" class="input" type="tel" formControlName="phone" autocomplete="tel" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.address' | transloco }}</span>
            <input name="address" class="input" formControlName="address" autocomplete="street-address" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.city' | transloco }}</span>
            <input name="city" class="input" formControlName="city" autocomplete="off" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.status' | transloco }}</span>
            <select name="status" class="select" formControlName="status">
              @for (option of statuses; track option) {
                <option [value]="option">{{ 'status.' + option | transloco }}</option>
              }
            </select>
          </label>
        </div>

        <label class="field">
          <span class="field-label">{{ 'students.form.notes' | transloco }}</span>
          <textarea name="notes" class="textarea" formControlName="notes" rows="3"></textarea>
        </label>

        <div class="divider"></div>

        <div class="space-y-3">
          <label class="flex items-start gap-2.5 text-[13px] text-ink-2">
            <input name="consentData"
              type="checkbox"
              formControlName="consentData"
              class="mt-0.5 h-4 w-4 rounded border-line accent-[var(--accent)]" autocomplete="off" />
            <span>{{ 'students.form.consentData' | transloco }}</span>
          </label>
          <label class="flex items-start gap-2.5 text-[13px] text-ink-2">
            <input name="consentMedia"
              type="checkbox"
              formControlName="consentMedia"
              class="mt-0.5 h-4 w-4 rounded border-line accent-[var(--accent)]" autocomplete="off" />
            <span>{{ 'students.form.consentMedia' | transloco }}</span>
          </label>
        </div>
      </form>

      <div drawer-footer class="flex justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="closeCreate()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="submit"
          form="student-create-form"
          class="btn btn-primary"
          [disabled]="saving()"
        >
          {{ (saving() ? 'common.saving' : 'common.create') | transloco }}
        </button>
      </div>
    </app-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentsPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  readonly data = signal<Student[]>([]);
  readonly meta = signal<PageMeta | null>(null);
  readonly loading = signal(true);
  readonly page = signal(1);
  readonly pageSize = signal(12);
  readonly search = signal('');
  readonly branchId = signal('');
  readonly programId = signal('');
  readonly status = signal<StudentStatus | ''>('');
  readonly options = signal<AcademicsOptions | null>(null);
  readonly createOpen = signal(false);
  readonly saving = signal(false);

  readonly canWrite = computed(() => this.auth.has('students.write'));
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];
  readonly statuses: StudentStatus[] = ['ACTIVE', 'INACTIVE', 'GRADUATED', 'ARCHIVED'];

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(80)]],
    branchId: ['', [Validators.required]],
    registrationNumber: [''],
    birthDate: [''],
    gender: [''],
    email: ['', [Validators.email]],
    phone: [''],
    address: [''],
    city: [''],
    status: ['ACTIVE' as StudentStatus, [Validators.required]],
    notes: [''],
    consentData: [false],
    consentMedia: [false],
  });

  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private loadSequence = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearSearchTimer());
    if (this.auth.has('academics.read')) void this.loadOptions();
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.clearSearchTimer();
      const term = params.get('search') ?? '';
      this.search.set(term);
      this.page.set(1);
      void this.load();
    });
  }

  activeEnrollment(student: Student): Enrollment | null {
    return student.enrollments?.find((enrollment) => enrollment.status === 'ACTIVE') ?? null;
  }

  go(page: number): void {
    this.page.set(page);
    void this.load();
  }

  openStudent(id: string): void {
    void this.router.navigate(['/app/students', id]);
  }

  onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.clearSearchTimer();
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      void this.load();
    }, 350);
  }

  onSearchEnter(): void {
    this.clearSearchTimer();
    this.page.set(1);
    void this.load();
  }

  onBranchChange(event: Event): void {
    this.clearSearchTimer();
    this.branchId.set((event.target as HTMLSelectElement).value);
    this.page.set(1);
    void this.load();
  }

  onProgramChange(event: Event): void {
    this.clearSearchTimer();
    this.programId.set((event.target as HTMLSelectElement).value);
    this.page.set(1);
    void this.load();
  }

  onStatusChange(event: Event): void {
    this.clearSearchTimer();
    const value = (event.target as HTMLSelectElement).value;
    this.status.set(value as StudentStatus | '');
    this.page.set(1);
    void this.load();
  }

  openCreate(): void {
    this.form.reset({
      firstName: '',
      lastName: '',
      branchId: this.options()?.branches[0]?.id ?? '',
      registrationNumber: '',
      birthDate: '',
      gender: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      status: 'ACTIVE',
      notes: '',
      consentData: false,
      consentMedia: false,
    });
    this.createOpen.set(true);
  }

  closeCreate(): void {
    if (this.saving()) return;
    this.createOpen.set(false);
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const created = await firstValueFrom(this.api.post<Student>('/students', this.payload()));
      this.toast.success(this.transloco.translate('students.form.created'));
      this.createOpen.set(false);
      await this.load();
      await this.router.navigate(['/app/students', created.id]);
    } catch {
      // Errors are surfaced globally by the HTTP error interceptor.
    } finally {
      this.saving.set(false);
    }
  }

  private payload(): CreateStudentPayload {
    const value = this.form.getRawValue();
    const payload: CreateStudentPayload = {
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      branchId: value.branchId,
      status: value.status,
      consentData: value.consentData,
      consentMedia: value.consentMedia,
    };
    const registrationNumber = value.registrationNumber.trim();
    if (registrationNumber) payload.registrationNumber = registrationNumber;
    if (value.birthDate) payload.birthDate = value.birthDate;
    if (value.gender) payload.gender = value.gender;
    const email = value.email.trim();
    if (email) payload.email = email;
    const phone = value.phone.trim();
    if (phone) payload.phone = phone;
    const address = value.address.trim();
    if (address) payload.address = address;
    const city = value.city.trim();
    if (city) payload.city = city;
    const notes = value.notes.trim();
    if (notes) payload.notes = notes;
    return payload;
  }

  private async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    try {
      const response = await firstValueFrom(
        this.api.list<Student>('/students', {
          page: this.page(),
          pageSize: this.pageSize(),
          search: this.search().trim(),
          branchId: this.branchId(),
          programId: this.programId(),
          status: this.status(),
        }),
      );
      if (sequence !== this.loadSequence) return;
      this.data.set(response.data);
      this.meta.set(response.meta ?? null);
    } catch {
      // Errors are surfaced globally by the HTTP error interceptor.
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }

  private async loadOptions(): Promise<void> {
    try {
      const options = await firstValueFrom(this.api.get<AcademicsOptions>('/academics/options'));
      this.options.set(options);
      if (!this.form.controls.branchId.value && options.branches.length) {
        this.form.controls.branchId.patchValue(options.branches[0].id);
      }
    } catch {
      // Options are optional; read-only roles may not have academics access.
    }
  }

  private clearSearchTimer(): void {
    if (this.searchTimer !== undefined) {
      clearTimeout(this.searchTimer);
      this.searchTimer = undefined;
    }
  }
}
