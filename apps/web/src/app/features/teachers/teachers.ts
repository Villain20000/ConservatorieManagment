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
import type { PageMeta, Teacher, TeacherStatus } from '../../core/models';

interface TeacherPayload {
  firstName: string;
  lastName: string;
  status: TeacherStatus;
  email?: string;
  phone?: string;
  employeeNo?: string;
  title?: string;
  specialties?: string[];
  bio?: string;
}

@Component({
  selector: 'app-teachers-page',
  imports: [...SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="teachers.title" subtitle="teachers.subtitle">
        @if (canWrite()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <app-icon name="plus" [size]="16" />
            {{ 'teachers.new' | transloco }}
          </button>
        }
      </app-page-header>

      <div class="card card-pad mb-5">
        <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div class="relative">
            <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
              <app-icon name="search" [size]="15" />
            </span>
            <input
              type="search"
              class="input pl-9"
              [value]="search()"
              [placeholder]="'teachers.searchPlaceholder' | transloco"
              (input)="onSearchInput($event)"
              (keydown.enter)="onSearchEnter()"
            />
          </div>
          <select
            class="select"
            [value]="status()"
            (change)="onStatusChange($event)"
            [attr.aria-label]="'teachers.columns.status' | transloco"
          >
            <option value="">{{ 'common.allStatuses' | transloco }}</option>
            @for (option of statuses; track option) {
              <option [value]="option">{{ 'status.' + option | transloco }}</option>
            }
          </select>
        </div>
      </div>

      @if (loading()) {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ 'teachers.columns.name' | transloco }}</th>
                <th>{{ 'teachers.columns.specialties' | transloco }}</th>
                <th>{{ 'teachers.columns.series' | transloco }}</th>
                <th>{{ 'teachers.columns.students' | transloco }}</th>
                <th>{{ 'teachers.columns.status' | transloco }}</th>
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
                  <td><div class="skeleton h-5 w-28 rounded-full"></div></td>
                  <td><div class="skeleton h-3 w-6"></div></td>
                  <td><div class="skeleton h-3 w-6"></div></td>
                  <td><div class="skeleton h-5 w-16 rounded-full"></div></td>
                  <td></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (!data().length) {
        <div class="card">
          <app-empty-state
            title="teachers.emptyTitle"
            message="teachers.emptyMessage"
            icon="users"
          />
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ 'teachers.columns.name' | transloco }}</th>
                <th>{{ 'teachers.columns.specialties' | transloco }}</th>
                <th>{{ 'teachers.columns.series' | transloco }}</th>
                <th>{{ 'teachers.columns.students' | transloco }}</th>
                <th>{{ 'teachers.columns.status' | transloco }}</th>
                <th class="w-10"></th>
              </tr>
            </thead>
            <tbody>
              @for (teacher of data(); track teacher.id) {
                <tr
                  class="row-link"
                  tabindex="0"
                  (click)="openTeacher(teacher.id)"
                  (keydown.enter)="openTeacher(teacher.id)"
                >
                  <td>
                    <div class="flex items-center gap-3">
                      <app-avatar
                        [firstName]="teacher.firstName"
                        [lastName]="teacher.lastName"
                        [size]="36"
                      />
                      <div class="min-w-0">
                        <p class="truncate font-semibold text-ink">
                          {{ teacher.firstName }} {{ teacher.lastName }}
                        </p>
                        <p class="truncate text-[12px] text-ink-3">
                          {{ teacher.email || ('common.noneFound' | transloco) }}
                          @if (teacher.employeeNo) {
                            <span> · {{ teacher.employeeNo }}</span>
                          }
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    @if (teacher.specialties.length) {
                      <div class="flex flex-wrap gap-1">
                        @for (specialty of teacher.specialties; track $index) {
                          <span class="badge badge-accent">{{ specialty }}</span>
                        }
                      </div>
                    } @else {
                      <span class="text-ink-3">{{ 'teachers.noSpecialties' | transloco }}</span>
                    }
                  </td>
                  <td class="tabular-nums">{{ teacher._count?.lessonSeries ?? 0 }}</td>
                  <td class="tabular-nums">{{ teacher._count?.enrollments ?? 0 }}</td>
                  <td><app-status-badge [status]="teacher.status" /></td>
                  <td class="text-right">
                    <app-icon name="chevron-right" [size]="16" />
                  </td>
                </tr>
              }
            </tbody>
          </table>
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
      title="teachers.form.createTitle"
      size="lg"
      [showFooter]="true"
      (closed)="closeCreate()"
    >
      <form id="teacher-create-form" [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="field">
            <span class="field-label">{{ 'teachers.form.firstName' | transloco }}</span>
            <input class="input" formControlName="firstName" autocomplete="given-name" />
            @if (form.controls.firstName.invalid && form.controls.firstName.touched) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'teachers.form.lastName' | transloco }}</span>
            <input class="input" formControlName="lastName" autocomplete="family-name" />
            @if (form.controls.lastName.invalid && form.controls.lastName.touched) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'teachers.form.email' | transloco }}</span>
            <input class="input" type="email" formControlName="email" autocomplete="email" />
            @if (form.controls.email.invalid && form.controls.email.touched) {
              <span class="field-error">{{ 'common.invalidEmail' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'teachers.form.phone' | transloco }}</span>
            <input class="input" type="tel" formControlName="phone" autocomplete="tel" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'teachers.form.employeeNo' | transloco }}</span>
            <input class="input" formControlName="employeeNo" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'teachers.form.title' | transloco }}</span>
            <input class="input" formControlName="title" />
          </label>
          <label class="field sm:col-span-2">
            <span class="field-label">{{ 'teachers.form.specialties' | transloco }}</span>
            <input class="input" formControlName="specialties" />
            <span class="field-hint">{{ 'teachers.form.specialtiesHint' | transloco }}</span>
          </label>
          <label class="field">
            <span class="field-label">{{ 'teachers.form.status' | transloco }}</span>
            <select class="select" formControlName="status">
              @for (option of statuses; track option) {
                <option [value]="option">{{ 'status.' + option | transloco }}</option>
              }
            </select>
          </label>
          <label class="field sm:col-span-2">
            <span class="field-label">{{ 'teachers.form.bio' | transloco }}</span>
            <textarea class="textarea" formControlName="bio" rows="4"></textarea>
          </label>
        </div>
      </form>

      <div drawer-footer class="flex justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="closeCreate()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="submit"
          form="teacher-create-form"
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
export class TeachersPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  readonly data = signal<Teacher[]>([]);
  readonly meta = signal<PageMeta | null>(null);
  readonly loading = signal(true);
  readonly page = signal(1);
  readonly pageSize = signal(12);
  readonly search = signal('');
  readonly status = signal<TeacherStatus | ''>('');
  readonly createOpen = signal(false);
  readonly saving = signal(false);

  readonly canWrite = computed(() => this.auth.has('teachers.write'));
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];
  readonly statuses: TeacherStatus[] = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.email]],
    phone: [''],
    employeeNo: [''],
    title: [''],
    specialties: [''],
    bio: [''],
    status: ['ACTIVE' as TeacherStatus, [Validators.required]],
  });

  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private loadSequence = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearSearchTimer());
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.clearSearchTimer();
      this.search.set(params.get('search') ?? '');
      this.page.set(1);
      void this.load();
    });
  }

  go(page: number): void {
    this.page.set(page);
    void this.load();
  }

  openTeacher(id: string): void {
    void this.router.navigate(['/app/teachers', id]);
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

  onStatusChange(event: Event): void {
    this.clearSearchTimer();
    const value = (event.target as HTMLSelectElement).value;
    this.status.set(value as TeacherStatus | '');
    this.page.set(1);
    void this.load();
  }

  openCreate(): void {
    this.form.reset({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      employeeNo: '',
      title: '',
      specialties: '',
      bio: '',
      status: 'ACTIVE',
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
      await firstValueFrom(this.api.post<Teacher>('/teachers', this.payload()));
      this.toast.success(this.transloco.translate('teachers.form.created'));
      this.createOpen.set(false);
      await this.load();
    } catch {
      // Errors are surfaced globally by the HTTP error interceptor.
    } finally {
      this.saving.set(false);
    }
  }

  private payload(): TeacherPayload {
    const value = this.form.getRawValue();
    const payload: TeacherPayload = {
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      status: value.status,
    };
    const email = value.email.trim();
    if (email) payload.email = email;
    const phone = value.phone.trim();
    if (phone) payload.phone = phone;
    const employeeNo = value.employeeNo.trim();
    if (employeeNo) payload.employeeNo = employeeNo;
    const title = value.title.trim();
    if (title) payload.title = title;
    const specialties = value.specialties
      .split(',')
      .map((specialty) => specialty.trim())
      .filter((specialty) => specialty.length > 0);
    if (specialties.length) payload.specialties = specialties;
    const bio = value.bio.trim();
    if (bio) payload.bio = bio;
    return payload;
  }

  private async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    try {
      const response = await firstValueFrom(
        this.api.list<Teacher>('/teachers', {
          page: this.page(),
          pageSize: this.pageSize(),
          search: this.search().trim(),
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

  private clearSearchTimer(): void {
    if (this.searchTimer !== undefined) {
      clearTimeout(this.searchTimer);
      this.searchTimer = undefined;
    }
  }
}
