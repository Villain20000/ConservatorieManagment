import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { FormatService } from '../../core/format.service';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';
import type {
  LessonSeries,
  Level,
  Program,
  StudentRef,
  Teacher,
  TeacherStatus,
} from '../../core/models';

interface TeacherEnrollment {
  id: string;
  student?: StudentRef;
  program?: Pick<Program, 'id' | 'name'>;
  level?: Pick<Level, 'id' | 'name'> | null;
}

interface TeacherDetailData extends Omit<Teacher, 'lessonSeries' | '_count'> {
  lessonSeries: LessonSeries[];
  enrollments: TeacherEnrollment[];
  _count?: { lessonSeries?: number; enrollments?: number; lessons?: number };
}

interface TeacherPayload {
  firstName: string;
  lastName: string;
  status: TeacherStatus;
  email?: string | null;
  phone?: string | null;
  employeeNo?: string | null;
  title?: string | null;
  specialties?: string[];
  bio?: string | null;
}

@Component({
  selector: 'app-teacher-detail-page',
  imports: [...SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <a
        routerLink="/app/teachers"
        class="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3 transition-colors hover:text-ink"
      >
        <app-icon name="arrow-left" [size]="14" />
        {{ 'teachers.detail.back' | transloco }}
      </a>

      @if (loading() && !teacher()) {
        <div class="space-y-5">
          <div class="flex items-center gap-4">
            <div class="skeleton h-16 w-16 rounded-full"></div>
            <div class="space-y-2">
              <div class="skeleton h-5 w-48"></div>
              <div class="skeleton h-3 w-32"></div>
            </div>
          </div>
          <div class="grid gap-4 sm:grid-cols-3">
            @for (row of [0, 1, 2]; track row) {
              <div class="card card-pad space-y-3">
                <div class="skeleton h-3 w-24"></div>
                <div class="skeleton h-5 w-16"></div>
              </div>
            }
          </div>
        </div>
      } @else if (teacher(); as t) {
        <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div class="flex min-w-0 items-start gap-4">
            <app-avatar [firstName]="t.firstName" [lastName]="t.lastName" [size]="64" />
            <div class="min-w-0">
              <h1
                class="truncate text-[26px] font-semibold leading-tight tracking-[-0.025em] sm:text-[30px]"
              >
                {{ t.firstName }} {{ t.lastName }}
              </h1>
              <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                @if (t.title) {
                  <span>{{ t.title }}</span>
                  <span aria-hidden="true">·</span>
                }
                @if (t.employeeNo) {
                  <span class="font-mono tabular-nums">{{ t.employeeNo }}</span>
                  <span aria-hidden="true">·</span>
                }
                <app-status-badge [status]="t.status" />
              </div>
            </div>
          </div>
          @if (canWrite()) {
            <button type="button" class="btn btn-secondary" (click)="openEdit()">
              <app-icon name="pencil" [size]="15" />
              {{ 'teachers.detail.edit' | transloco }}
            </button>
          }
        </header>

        <div class="mb-5 grid gap-4 sm:grid-cols-3">
          <app-stat-card
            label="teachers.columns.series"
            [value]="seriesCount()"
            icon="music"
            tone="accent"
          />
          <app-stat-card
            label="teachers.columns.students"
            [value]="studentCount()"
            icon="users"
            tone="info"
          />
          <app-stat-card
            label="teachers.detail.weeklyHours"
            [value]="weeklyHours()"
            icon="clock"
            tone="default"
          />
        </div>

        <div class="mb-5 grid gap-5 lg:grid-cols-3">
          <section class="card">
            <div class="card-head">
              <h2 class="text-[14px] font-semibold">
                {{ 'teachers.detail.contact' | transloco }}
              </h2>
            </div>
            <div class="space-y-3.5 px-5 py-5 sm:px-6">
              <div class="flex items-start gap-3">
                <span class="mt-0.5 text-ink-3"><app-icon name="mail" [size]="15" /></span>
                <div class="min-w-0">
                  <p class="eyebrow">{{ 'common.email' | transloco }}</p>
                  <p class="mt-0.5 truncate text-[13.5px] text-ink">
                    {{ t.email || ('common.noneFound' | transloco) }}
                  </p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <span class="mt-0.5 text-ink-3"><app-icon name="phone" [size]="15" /></span>
                <div>
                  <p class="eyebrow">{{ 'common.phone' | transloco }}</p>
                  <p class="mt-0.5 text-[13.5px] text-ink">
                    {{ t.phone || ('common.noneFound' | transloco) }}
                  </p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <span class="mt-0.5 text-ink-3"><app-icon name="briefcase" [size]="15" /></span>
                <div>
                  <p class="eyebrow">{{ 'teachers.form.employeeNo' | transloco }}</p>
                  <p class="mt-0.5 text-[13.5px] text-ink">
                    {{ t.employeeNo || ('common.noneFound' | transloco) }}
                  </p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <span class="mt-0.5 text-ink-3"><app-icon name="badge-check" [size]="15" /></span>
                <div>
                  <p class="eyebrow">{{ 'teachers.detail.titleLabel' | transloco }}</p>
                  <p class="mt-0.5 text-[13.5px] text-ink">
                    {{ t.title || ('common.noneFound' | transloco) }}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section class="card lg:col-span-2">
            <div class="card-head">
              <h2 class="text-[14px] font-semibold">
                {{ 'teachers.detail.specialties' | transloco }}
              </h2>
            </div>
            <div class="px-5 py-5 sm:px-6">
              @if (t.specialties.length) {
                <div class="flex flex-wrap gap-1.5">
                  @for (specialty of t.specialties; track $index) {
                    <span class="badge badge-accent">{{ specialty }}</span>
                  }
                </div>
              } @else {
                <p class="text-[13px] text-ink-3">{{ 'teachers.noSpecialties' | transloco }}</p>
              }
            </div>
            <div class="border-t border-line px-5 py-5 sm:px-6">
              <h3 class="eyebrow">{{ 'teachers.detail.bio' | transloco }}</h3>
              @if (t.bio) {
                <p class="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
                  {{ t.bio }}
                </p>
              } @else {
                <p class="mt-2 text-[13px] text-ink-3">{{ 'common.noneFound' | transloco }}</p>
              }
            </div>
          </section>
        </div>

        <section class="card">
          <div class="card-head">
            <h2 class="text-[14px] font-semibold">
              {{ 'teachers.detail.series' | transloco }}
            </h2>
            <span class="badge badge-neutral">{{ seriesCount() }}</span>
          </div>
          @if (t.lessonSeries.length) {
            <div class="overflow-x-auto">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ 'schedule.form.title' | transloco }}</th>
                    <th>{{ 'schedule.form.program' | transloco }}</th>
                    <th>{{ 'schedule.form.level' | transloco }}</th>
                    <th>{{ 'schedule.form.branch' | transloco }}</th>
                    <th>{{ 'schedule.form.room' | transloco }}</th>
                    <th>{{ 'schedule.form.weekday' | transloco }}</th>
                    <th>{{ 'schedule.form.startTime' | transloco }}</th>
                    <th>{{ 'schedule.form.duration' | transloco }}</th>
                    <th>{{ 'schedule.form.students' | transloco }}</th>
                    <th>{{ 'schedule.lesson.status' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (series of t.lessonSeries; track series.id) {
                    <tr>
                      <td class="font-semibold text-ink">{{ series.title }}</td>
                      <td>{{ series.program?.name || ('common.noneFound' | transloco) }}</td>
                      <td>{{ series.level?.name || ('common.noneFound' | transloco) }}</td>
                      <td>{{ series.branch?.name || ('common.noneFound' | transloco) }}</td>
                      <td>{{ series.room?.name || ('common.noneFound' | transloco) }}</td>
                      <td>{{ 'weekday.' + series.weekday | transloco }}</td>
                      <td class="whitespace-nowrap tabular-nums">
                        {{ series.startTime.slice(0, 5) }}
                      </td>
                      <td class="whitespace-nowrap">
                        {{
                          'schedule.lesson.duration'
                            | transloco: { minutes: series.durationMinutes }
                        }}
                      </td>
                      <td class="tabular-nums">{{ series._count?.students ?? 0 }}</td>
                      <td><app-status-badge [status]="series.status" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <app-empty-state title="teachers.detail.seriesEmpty" icon="calendar" />
          }
        </section>
      } @else {
        <div class="card">
          <app-empty-state title="errors.notFound" message="teachers.emptyMessage" icon="users" />
        </div>
      }
    </div>

    <app-drawer
      [open]="editOpen()"
      title="teachers.form.editTitle"
      size="lg"
      [showFooter]="true"
      (closed)="closeEdit()"
    >
      <form id="teacher-edit-form" [formGroup]="form" (ngSubmit)="submitEdit()" class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="field">
            <span class="field-label">{{ 'teachers.form.firstName' | transloco }}</span>
            <input class="input" formControlName="firstName" />
            @if (form.controls.firstName.invalid && form.controls.firstName.touched) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'teachers.form.lastName' | transloco }}</span>
            <input class="input" formControlName="lastName" />
            @if (form.controls.lastName.invalid && form.controls.lastName.touched) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'teachers.form.email' | transloco }}</span>
            <input class="input" type="email" formControlName="email" />
            @if (form.controls.email.invalid && form.controls.email.touched) {
              <span class="field-error">{{ 'common.invalidEmail' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'teachers.form.phone' | transloco }}</span>
            <input class="input" type="tel" formControlName="phone" />
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
        <button type="button" class="btn btn-secondary" (click)="closeEdit()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="submit"
          form="teacher-edit-form"
          class="btn btn-primary"
          [disabled]="saving()"
        >
          {{ (saving() ? 'common.saving' : 'common.save') | transloco }}
        </button>
      </div>
    </app-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherDetailPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly format = inject(FormatService);
  private readonly fb = inject(FormBuilder);

  readonly id = input.required<string>();

  readonly teacher = signal<TeacherDetailData | null>(null);
  readonly loading = signal(true);
  readonly editOpen = signal(false);
  readonly saving = signal(false);

  readonly canWrite = computed(() => this.auth.has('teachers.write'));
  readonly statuses: TeacherStatus[] = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];

  private loadSequence = 0;

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

  readonly seriesCount = computed(() => {
    const teacher = this.teacher();
    return teacher?.lessonSeries.length ?? teacher?._count?.lessonSeries ?? 0;
  });

  readonly studentCount = computed(() => {
    const teacher = this.teacher();
    return teacher?.enrollments.length ?? teacher?._count?.enrollments ?? 0;
  });

  readonly weeklyHours = computed(() => {
    const minutes = (this.teacher()?.lessonSeries ?? []).reduce(
      (sum, series) => sum + series.durationMinutes,
      0,
    );
    return this.format.number(minutes / 60, 1);
  });

  constructor() {
    effect(() => {
      const teacherId = this.id();
      void this.load(teacherId);
    });
  }

  openEdit(): void {
    const teacher = this.teacher();
    if (!teacher) return;
    this.form.reset({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      email: teacher.email ?? '',
      phone: teacher.phone ?? '',
      employeeNo: teacher.employeeNo ?? '',
      title: teacher.title ?? '',
      specialties: teacher.specialties.join(', '),
      bio: teacher.bio ?? '',
      status: teacher.status,
    });
    this.editOpen.set(true);
  }

  closeEdit(): void {
    if (!this.saving()) this.editOpen.set(false);
  }

  async submitEdit(): Promise<void> {
    const teacher = this.teacher();
    if (!teacher || this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.patch(`/teachers/${teacher.id}`, this.payload()));
      this.toast.success(this.transloco.translate('teachers.form.saved'));
      this.editOpen.set(false);
      await this.load(teacher.id);
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
      specialties: value.specialties
        .split(',')
        .map((specialty) => specialty.trim())
        .filter((specialty) => specialty.length > 0),
    };
    payload.email = value.email.trim() || null;
    payload.phone = value.phone.trim() || null;
    payload.employeeNo = value.employeeNo.trim() || null;
    payload.title = value.title.trim() || null;
    payload.bio = value.bio.trim() || null;
    return payload;
  }

  private async load(teacherId: string): Promise<void> {
    if (!teacherId) return;
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    try {
      const teacher = await firstValueFrom(
        this.api.get<TeacherDetailData>(`/teachers/${teacherId}`),
      );
      if (sequence !== this.loadSequence) return;
      this.teacher.set(teacher);
    } catch {
      // Errors are surfaced globally by the HTTP error interceptor.
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }
}
