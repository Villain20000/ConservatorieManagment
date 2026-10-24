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
import { ConfirmService } from '../../core/confirm.service';
import { FormatService } from '../../core/format.service';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';
import type {
  AcademicsOptions,
  AcademicYear,
  Attendance,
  AttendanceStatus,
  DocumentRecord,
  Enrollment,
  StudentDetail,
  StudentGuardian,
  StudentLedger,
  StudentStatus,
} from '../../core/models';

type TabKey = 'overview' | 'guardians' | 'enrollments' | 'attendance' | 'finance' | 'documents';

interface TabItem {
  key: TabKey;
  label: string;
  count: number | null;
}

interface StudentFinanceSummary {
  billed?: number;
  collected?: number;
  outstanding?: number;
  totalPaid?: number;
}

type StudentDetailData = Omit<StudentDetail, 'financeSummary'> & {
  financeSummary?: StudentFinanceSummary | null;
};

interface TeacherOption {
  id: string;
  firstName: string;
  lastName: string;
  specialties: string[];
}

interface AcademicsOptionsWithTeachers extends AcademicsOptions {
  teachers: TeacherOption[];
  activeYear: AcademicYear | null;
}

interface UpdateStudentPayload {
  firstName: string;
  lastName: string;
  branchId: string;
  status: StudentStatus;
  consentData: boolean;
  consentMedia: boolean;
  registrationNumber?: string;
  birthDate?: string | null;
  gender?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
}

interface GuardianPayload {
  firstName: string;
  lastName: string;
  isPrimary: boolean;
  relationship?: string;
  phone?: string;
  email?: string;
  taxId?: string;
  occupation?: string;
  address?: string;
}

interface EnrollmentPayload {
  programId: string;
  levelId: string;
  academicYearId: string;
  branchId: string;
  teacherId?: string;
}

interface StatusPayload {
  status: StudentStatus;
  reason?: string;
}

interface StudentFormValue {
  firstName: string;
  lastName: string;
  branchId: string;
  registrationNumber: string;
  birthDate: string;
  gender: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  status: StudentStatus;
  notes: string;
  consentData: boolean;
  consentMedia: boolean;
}

@Component({
  selector: 'app-student-detail-page',
  imports: [...SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <a
        routerLink="/app/students"
        class="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3 transition-colors hover:text-ink"
      >
        <app-icon name="arrow-left" [size]="14" />
        {{ 'students.detail.back' | transloco }}
      </a>

      @if (loading() && !student()) {
        <div class="space-y-5">
          <div class="flex items-center gap-4">
            <div class="skeleton h-16 w-16 rounded-full"></div>
            <div class="space-y-2">
              <div class="skeleton h-5 w-52"></div>
              <div class="skeleton h-3 w-40"></div>
            </div>
          </div>
          <div class="grid gap-4 lg:grid-cols-3">
            @for (row of [0, 1, 2]; track row) {
              <div class="card card-pad space-y-3">
                <div class="skeleton h-3 w-24"></div>
                <div class="skeleton h-3 w-full"></div>
                <div class="skeleton h-3 w-2/3"></div>
              </div>
            }
          </div>
        </div>
      } @else if (student(); as s) {
        <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div class="flex min-w-0 items-start gap-4">
            <app-avatar [firstName]="s.firstName" [lastName]="s.lastName" [size]="64" />
            <div class="min-w-0">
              <h1
                class="truncate text-[26px] font-semibold leading-tight tracking-[-0.025em] sm:text-[30px]"
              >
                {{ s.firstName }} {{ s.lastName }}
              </h1>
              <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                <span class="font-mono tabular-nums text-ink-2">{{ s.registrationNumber }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ s.branch?.name || ('common.noneFound' | transloco) }}</span>
                <app-status-badge [status]="s.status" />
              </div>
              <div class="mt-2.5 flex flex-wrap gap-1.5">
                <span
                  class="badge"
                  [class.badge-success]="s.consentData"
                  [class.badge-neutral]="!s.consentData"
                >
                  {{ 'students.detail.consentData' | transloco }} ·
                  {{ (s.consentData ? 'common.yes' : 'common.no') | transloco }}
                </span>
                <span
                  class="badge"
                  [class.badge-success]="s.consentMedia"
                  [class.badge-neutral]="!s.consentMedia"
                >
                  {{ 'students.detail.consentMedia' | transloco }} ·
                  {{ (s.consentMedia ? 'common.yes' : 'common.no') | transloco }}
                </span>
              </div>
            </div>
          </div>
          @if (canWrite()) {
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="btn btn-secondary" (click)="openEdit()">
                <app-icon name="pencil" [size]="15" />
                {{ 'students.detail.edit' | transloco }}
              </button>
              <button type="button" class="btn btn-secondary" (click)="openStatus()">
                <app-icon name="refresh" [size]="15" />
                {{ 'students.detail.changeStatus' | transloco }}
              </button>
            </div>
          }
        </header>

        <div class="mb-5 flex gap-1 overflow-x-auto border-b border-line">
          @for (tab of tabs(); track tab.key) {
            <button
              type="button"
              class="relative shrink-0 px-3 py-2.5 text-[13px] font-semibold transition-colors"
              [class.text-ink]="activeTab() === tab.key"
              [class.text-ink-3]="activeTab() !== tab.key"
              (click)="selectTab(tab.key)"
            >
              {{ tab.label | transloco }}
              @if (tab.count !== null) {
                <span class="badge badge-neutral ml-1.5">{{ tab.count }}</span>
              }
              @if (activeTab() === tab.key) {
                <span class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"></span>
              }
            </button>
          }
        </div>

        @switch (activeTab()) {
          @case ('overview') {
            <div class="grid gap-5 lg:grid-cols-3">
              <section class="card lg:col-span-2">
                <div class="card-head">
                  <h2 class="text-[14px] font-semibold">
                    {{ 'students.detail.personal' | transloco }}
                  </h2>
                </div>
                <dl class="grid gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
                  <div>
                    <dt class="eyebrow">{{ 'students.detail.registration' | transloco }}</dt>
                    <dd class="mt-1 font-mono text-[13.5px] tabular-nums text-ink">
                      {{ s.registrationNumber }}
                    </dd>
                  </div>
                  <div>
                    <dt class="eyebrow">{{ 'students.detail.birthDate' | transloco }}</dt>
                    <dd class="mt-1 text-[13.5px] text-ink">{{ format.date(s.birthDate) }}</dd>
                  </div>
                  <div>
                    <dt class="eyebrow">{{ 'students.detail.gender' | transloco }}</dt>
                    <dd class="mt-1 text-[13.5px] text-ink">
                      {{ genderLabel(s.gender) | transloco }}
                    </dd>
                  </div>
                  <div>
                    <dt class="eyebrow">{{ 'students.detail.email' | transloco }}</dt>
                    <dd class="mt-1 truncate text-[13.5px] text-ink">
                      {{ s.email || ('common.noneFound' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="eyebrow">{{ 'students.detail.phone' | transloco }}</dt>
                    <dd class="mt-1 text-[13.5px] text-ink">
                      {{ s.phone || ('common.noneFound' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="eyebrow">{{ 'students.detail.address' | transloco }}</dt>
                    <dd class="mt-1 text-[13.5px] text-ink">
                      {{ s.address || ('common.noneFound' | transloco) }}
                      @if (s.city) {
                        <span class="text-ink-3"> · {{ s.city }}</span>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="eyebrow">{{ 'students.detail.enrolledAt' | transloco }}</dt>
                    <dd class="mt-1 text-[13.5px] text-ink">{{ format.date(s.enrolledAt) }}</dd>
                  </div>
                  <div>
                    <dt class="eyebrow">{{ 'students.detail.consentData' | transloco }}</dt>
                    <dd class="mt-1">
                      <span
                        class="badge"
                        [class.badge-success]="s.consentData"
                        [class.badge-neutral]="!s.consentData"
                      >
                        {{ (s.consentData ? 'common.yes' : 'common.no') | transloco }}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt class="eyebrow">{{ 'students.detail.consentMedia' | transloco }}</dt>
                    <dd class="mt-1">
                      <span
                        class="badge"
                        [class.badge-success]="s.consentMedia"
                        [class.badge-neutral]="!s.consentMedia"
                      >
                        {{ (s.consentMedia ? 'common.yes' : 'common.no') | transloco }}
                      </span>
                    </dd>
                  </div>
                  @if (s.notes) {
                    <div class="sm:col-span-2">
                      <dt class="eyebrow">{{ 'students.form.notes' | transloco }}</dt>
                      <dd class="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
                        {{ s.notes }}
                      </dd>
                    </div>
                  }
                </dl>
              </section>

              @if (attendanceSummary(); as summary) {
                <section class="card card-pad">
                  <div class="flex items-start justify-between gap-3">
                    <h2 class="text-[14px] font-semibold">
                      {{ 'students.detail.overview.attendance' | transloco }}
                    </h2>
                    <span class="text-ink-3"><app-icon name="activity" [size]="16" /></span>
                  </div>
                  <p class="mt-3 text-[30px] font-semibold leading-none tabular-nums">
                    {{ format.percent(summary.rate) }}
                  </p>
                  <p class="mt-1.5 text-[12px] text-ink-3">
                    {{
                      'students.detail.overview.attendanceHint'
                        | transloco: { present: summary.PRESENT, total: summary.total }
                    }}
                  </p>
                  <div class="mt-3">
                    <app-progress [value]="summary.rate ?? 0" [tone]="attendanceTone()" />
                  </div>
                  <div class="mt-4 grid grid-cols-2 gap-2">
                    @for (item of attendanceBreakdown(); track item.status) {
                      <div class="rounded-lg bg-surface-2 px-3 py-2">
                        <p class="text-[11px] text-ink-3">{{ item.label | transloco }}</p>
                        <p class="text-[15px] font-semibold tabular-nums">{{ item.value }}</p>
                      </div>
                    }
                  </div>
                </section>
              }

              <section class="card lg:col-span-2">
                <div class="card-head">
                  <h2 class="text-[14px] font-semibold">
                    {{ 'students.detail.overview.programs' | transloco }}
                  </h2>
                </div>
                @if (activeEnrollments().length) {
                  <ul class="divide-y divide-line">
                    @for (enrollment of activeEnrollments(); track enrollment.id) {
                      <li
                        class="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6"
                      >
                        <div class="flex min-w-0 items-center gap-3">
                          <span class="icon-box"><app-icon name="music" [size]="16" /></span>
                          <div class="min-w-0">
                            <p class="truncate text-[13.5px] font-semibold text-ink">
                              {{ enrollment.program?.name || ('common.noneFound' | transloco) }}
                            </p>
                            <p class="truncate text-[12px] text-ink-3">
                              {{ enrollment.level?.name || ('common.noneFound' | transloco) }}
                              · {{ teacherName(enrollment) }}
                            </p>
                          </div>
                        </div>
                        <app-status-badge [status]="enrollment.status" />
                      </li>
                    }
                  </ul>
                } @else {
                  <app-empty-state title="students.detail.overview.noPrograms" icon="graduation" />
                }
              </section>

              @if (s.financeSummary || canFinance()) {
                <section class="card card-pad">
                  <h2 class="text-[14px] font-semibold">
                    {{ 'students.detail.overview.finance' | transloco }}
                  </h2>
                  @if (s.financeSummary; as finance) {
                    <p class="mt-3 text-[26px] font-semibold leading-none tabular-nums">
                      {{ format.money(finance.outstanding) }}
                    </p>
                    <p class="mt-1.5 text-[12px] text-ink-3">
                      {{
                        'students.detail.overview.financeHint'
                          | transloco: { amount: format.money(finance.outstanding) }
                      }}
                    </p>
                  } @else {
                    <p class="mt-2 text-[12.5px] text-ink-3">
                      {{ 'students.detail.finance.empty' | transloco }}
                    </p>
                  }
                  @if (canFinance()) {
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm mt-4"
                      (click)="openFinanceTab()"
                    >
                      {{ 'students.detail.finance.openLedger' | transloco }}
                      <app-icon name="arrow-right" [size]="14" />
                    </button>
                  }
                </section>
              }

              <section class="card lg:col-span-3">
                <div class="card-head">
                  <h2 class="text-[14px] font-semibold">
                    {{ 'students.detail.overview.recentActivity' | transloco }}
                  </h2>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    (click)="selectTab('attendance')"
                  >
                    {{ 'students.detail.overview.viewAll' | transloco }}
                    <app-icon name="arrow-right" [size]="14" />
                  </button>
                </div>
                @if (recentAttendance().length) {
                  <div class="overflow-x-auto">
                    <table class="table table-compact">
                      <thead>
                        <tr>
                          <th>{{ 'students.detail.attendance.date' | transloco }}</th>
                          <th>{{ 'students.detail.attendance.lesson' | transloco }}</th>
                          <th>{{ 'students.detail.attendance.status' | transloco }}</th>
                          <th>{{ 'students.detail.attendance.notes' | transloco }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (record of recentAttendance(); track record.id) {
                          <tr>
                            <td class="whitespace-nowrap">{{ attendanceDate(record) }}</td>
                            <td>{{ record.lesson?.title || ('common.noneFound' | transloco) }}</td>
                            <td><app-status-badge [status]="record.status" /></td>
                            <td class="max-w-[320px] truncate">{{ record.notes || '—' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <app-empty-state title="students.detail.attendance.empty" icon="calendar" />
                }
              </section>
            </div>
          }

          @case ('guardians') {
            <section>
              <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 class="text-[15px] font-semibold">
                  {{ 'students.detail.guardians.title' | transloco }}
                </h2>
                @if (canWrite()) {
                  <button type="button" class="btn btn-primary btn-sm" (click)="openGuardian()">
                    <app-icon name="user-plus" [size]="15" />
                    {{ 'students.detail.guardians.add' | transloco }}
                  </button>
                }
              </div>
              @if (s.guardians.length) {
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  @for (relation of s.guardians; track relation.id) {
                    <article class="card card-pad">
                      <div class="flex items-start justify-between gap-3">
                        <div class="flex min-w-0 items-center gap-3">
                          <app-avatar
                            [firstName]="relation.guardian.firstName"
                            [lastName]="relation.guardian.lastName"
                            [size]="40"
                          />
                          <div class="min-w-0">
                            <p class="truncate font-semibold text-ink">
                              {{ relation.guardian.firstName }} {{ relation.guardian.lastName }}
                            </p>
                            <p class="text-[12px] text-ink-3">
                              {{ relation.relationship || ('common.noneFound' | transloco) }}
                            </p>
                          </div>
                        </div>
                        <div class="flex shrink-0 items-center gap-1.5">
                          @if (relation.isPrimary) {
                            <span class="badge badge-accent">
                              {{ 'students.detail.guardians.primary' | transloco }}
                            </span>
                          }
                          @if (canWrite()) {
                            <button
                              type="button"
                              class="btn btn-ghost btn-icon-sm text-danger"
                              (click)="removeGuardian(relation)"
                              [attr.aria-label]="'common.remove' | transloco"
                            >
                              <app-icon name="trash" [size]="15" />
                            </button>
                          }
                        </div>
                      </div>
                      <div class="mt-4 space-y-2 text-[12.5px] text-ink-2">
                        @if (relation.guardian.phone) {
                          <p class="flex items-center gap-2">
                            <span class="text-ink-3"><app-icon name="phone" [size]="14" /></span>
                            {{ relation.guardian.phone }}
                          </p>
                        }
                        @if (relation.guardian.email) {
                          <p class="flex items-center gap-2">
                            <span class="text-ink-3"><app-icon name="mail" [size]="14" /></span>
                            <span class="truncate">{{ relation.guardian.email }}</span>
                          </p>
                        }
                        @if (relation.guardian.address) {
                          <p class="flex items-center gap-2">
                            <span class="text-ink-3"><app-icon name="map-pin" [size]="14" /></span>
                            <span class="truncate">{{ relation.guardian.address }}</span>
                          </p>
                        }
                        @if (
                          !relation.guardian.phone &&
                          !relation.guardian.email &&
                          !relation.guardian.address
                        ) {
                          <p class="text-ink-3">
                            {{ 'students.detail.guardians.noContact' | transloco }}
                          </p>
                        }
                      </div>
                    </article>
                  }
                </div>
              } @else {
                <div class="card">
                  <app-empty-state
                    title="students.detail.guardians.title"
                    message="students.detail.guardians.empty"
                    icon="user"
                  />
                </div>
              }
            </section>
          }

          @case ('enrollments') {
            <section>
              <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 class="text-[15px] font-semibold">
                  {{ 'students.detail.enrollments.title' | transloco }}
                </h2>
                @if (canWrite()) {
                  <button type="button" class="btn btn-primary btn-sm" (click)="openEnrollment()">
                    <app-icon name="plus" [size]="15" />
                    {{ 'students.detail.enrollments.add' | transloco }}
                  </button>
                }
              </div>
              @if (s.enrollments.length) {
                <div class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>{{ 'students.detail.enrollments.program' | transloco }}</th>
                        <th>{{ 'students.detail.enrollments.level' | transloco }}</th>
                        <th>{{ 'students.detail.enrollments.year' | transloco }}</th>
                        <th>{{ 'students.detail.enrollments.branch' | transloco }}</th>
                        <th>{{ 'students.detail.enrollments.teacher' | transloco }}</th>
                        <th>{{ 'students.detail.enrollments.status' | transloco }}</th>
                        <th>{{ 'students.detail.enrollments.enrolledAt' | transloco }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (enrollment of s.enrollments; track enrollment.id) {
                        <tr>
                          <td class="font-semibold text-ink">
                            {{ enrollment.program?.name || ('common.noneFound' | transloco) }}
                          </td>
                          <td>{{ enrollment.level?.name || ('common.noneFound' | transloco) }}</td>
                          <td>
                            {{ enrollment.academicYear?.name || ('common.noneFound' | transloco) }}
                          </td>
                          <td>{{ branchName(enrollment) }}</td>
                          <td>{{ teacherName(enrollment) }}</td>
                          <td><app-status-badge [status]="enrollment.status" /></td>
                          <td class="whitespace-nowrap">
                            {{ format.date(enrollment.enrolledAt) }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <div class="card">
                  <app-empty-state
                    title="students.detail.enrollments.title"
                    message="students.detail.enrollments.empty"
                    icon="graduation"
                  />
                </div>
              }
            </section>
          }

          @case ('attendance') {
            <section>
              @if (attendanceSummary(); as summary) {
                <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div class="card card-pad">
                    <p class="text-[11px] font-medium text-ink-3">
                      {{ 'students.detail.attendance.rate' | transloco }}
                    </p>
                    <p class="mt-1.5 text-[22px] font-semibold leading-none tabular-nums">
                      {{ format.percent(summary.rate) }}
                    </p>
                    <div class="mt-3">
                      <app-progress [value]="summary.rate ?? 0" [tone]="attendanceTone()" />
                    </div>
                  </div>
                  @for (item of attendanceBreakdown(); track item.status) {
                    <div class="card card-pad">
                      <p class="text-[11px] font-medium text-ink-3">
                        {{ item.label | transloco }}
                      </p>
                      <p class="mt-1.5 text-[22px] font-semibold leading-none tabular-nums">
                        {{ item.value }}
                      </p>
                    </div>
                  }
                </div>
              }
              <div class="mb-4">
                <h2 class="text-[15px] font-semibold">
                  {{ 'students.detail.attendance.title' | transloco }}
                </h2>
              </div>
              @if (s.attendances.length) {
                <div class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>{{ 'students.detail.attendance.date' | transloco }}</th>
                        <th>{{ 'students.detail.attendance.lesson' | transloco }}</th>
                        <th>{{ 'students.detail.attendance.status' | transloco }}</th>
                        <th>{{ 'attendance.lateMinutes' | transloco }}</th>
                        <th>{{ 'students.detail.attendance.notes' | transloco }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (record of s.attendances; track record.id) {
                        <tr>
                          <td class="whitespace-nowrap">{{ attendanceDate(record) }}</td>
                          <td>{{ record.lesson?.title || ('common.noneFound' | transloco) }}</td>
                          <td><app-status-badge [status]="record.status" /></td>
                          <td class="tabular-nums">{{ record.minutesLate ?? '—' }}</td>
                          <td class="max-w-[360px] truncate">{{ record.notes || '—' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <div class="card">
                  <app-empty-state
                    title="students.detail.attendance.title"
                    message="students.detail.attendance.empty"
                    icon="calendar"
                  />
                </div>
              }
            </section>
          }

          @case ('finance') {
            <section>
              @if (ledgerLoading()) {
                <div class="grid gap-3 sm:grid-cols-3">
                  @for (row of [0, 1, 2]; track row) {
                    <div class="card card-pad space-y-3">
                      <div class="skeleton h-3 w-20"></div>
                      <div class="skeleton h-5 w-28"></div>
                    </div>
                  }
                </div>
              } @else if (ledger(); as data) {
                <div class="mb-5 grid gap-3 sm:grid-cols-3">
                  <div class="card card-pad">
                    <p class="text-[11px] font-medium text-ink-3">
                      {{ 'finance.ledger.billed' | transloco }}
                    </p>
                    <p class="mt-1.5 text-[22px] font-semibold leading-none tabular-nums">
                      {{ format.money(data.summary.billed) }}
                    </p>
                  </div>
                  <div class="card card-pad">
                    <p class="text-[11px] font-medium text-ink-3">
                      {{ 'finance.ledger.collected' | transloco }}
                    </p>
                    <p
                      class="mt-1.5 text-[22px] font-semibold leading-none tabular-nums text-success"
                    >
                      {{ format.money(data.summary.collected) }}
                    </p>
                  </div>
                  <div class="card card-pad">
                    <p class="text-[11px] font-medium text-ink-3">
                      {{ 'finance.ledger.outstanding' | transloco }}
                    </p>
                    <p
                      class="mt-1.5 text-[22px] font-semibold leading-none tabular-nums text-danger"
                    >
                      {{ format.money(data.summary.outstanding) }}
                    </p>
                  </div>
                </div>
                <div class="mb-4">
                  <h2 class="text-[15px] font-semibold">
                    {{ 'students.detail.finance.title' | transloco }}
                  </h2>
                </div>
                @if (data.charges.length) {
                  <div class="table-wrap">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>{{ 'finance.ledger.description' | transloco }}</th>
                          <th>{{ 'finance.ledger.period' | transloco }}</th>
                          <th>{{ 'finance.ledger.dueDate' | transloco }}</th>
                          <th>{{ 'finance.ledger.status' | transloco }}</th>
                          <th>{{ 'finance.ledger.amount' | transloco }}</th>
                          <th>{{ 'finance.ledger.remaining' | transloco }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (charge of data.charges; track charge.id) {
                          <tr>
                            <td class="font-medium text-ink">{{ charge.description }}</td>
                            <td>{{ charge.period || '—' }}</td>
                            <td class="whitespace-nowrap">{{ format.date(charge.dueDate) }}</td>
                            <td><app-status-badge [status]="charge.status" /></td>
                            <td class="tabular-nums">{{ format.money(charge.amount) }}</td>
                            <td class="tabular-nums" [class.text-danger]="charge.balance > 0">
                              {{ format.money(charge.balance) }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <div class="card">
                    <app-empty-state title="students.detail.finance.empty" icon="receipt" />
                  </div>
                }
              } @else {
                <div class="card">
                  <app-empty-state title="students.detail.finance.empty" icon="receipt" />
                </div>
              }
            </section>
          }

          @case ('documents') {
            <section>
              @if (documentsLoading()) {
                <div class="card card-pad space-y-3">
                  @for (row of [0, 1, 2, 3]; track row) {
                    <div class="skeleton h-4 w-full"></div>
                  }
                </div>
              } @else if (documents(); as docs) {
                @if (docs.length) {
                  <div class="table-wrap">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>{{ 'documents.columns.title' | transloco }}</th>
                          <th>{{ 'documents.columns.type' | transloco }}</th>
                          <th>{{ 'documents.columns.reference' | transloco }}</th>
                          <th>{{ 'documents.columns.issuedAt' | transloco }}</th>
                          <th>{{ 'documents.columns.status' | transloco }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (document of docs; track document.id) {
                          <tr>
                            <td class="font-medium text-ink">{{ document.title }}</td>
                            <td>{{ 'documentType.' + document.type | transloco }}</td>
                            <td>
                              {{
                                document.referenceNumber || ('documents.noReference' | transloco)
                              }}
                            </td>
                            <td class="whitespace-nowrap">{{ format.date(document.issuedAt) }}</td>
                            <td><app-status-badge [status]="document.status" /></td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <div class="card">
                    <app-empty-state
                      title="students.detail.documents.title"
                      message="students.detail.documents.empty"
                      icon="file-text"
                    />
                  </div>
                }
              } @else {
                <div class="card">
                  <app-empty-state
                    title="students.detail.documents.title"
                    message="students.detail.documents.empty"
                    icon="file-text"
                  />
                </div>
              }
            </section>
          }
        }
      } @else {
        <div class="card">
          <app-empty-state title="errors.notFound" message="students.emptyMessage" icon="users" />
        </div>
      }
    </div>

    <app-drawer
      [open]="editOpen()"
      title="students.form.editTitle"
      size="lg"
      [showFooter]="true"
      (closed)="closeEdit()"
    >
      <form
        id="student-edit-form"
        [formGroup]="editForm"
        (ngSubmit)="submitEdit()"
        class="space-y-5"
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="field">
            <span class="field-label">{{ 'students.form.firstName' | transloco }}</span>
            <input class="input" formControlName="firstName" />
            @if (editForm.controls.firstName.invalid && editForm.controls.firstName.touched) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.lastName' | transloco }}</span>
            <input class="input" formControlName="lastName" />
            @if (editForm.controls.lastName.invalid && editForm.controls.lastName.touched) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.branch' | transloco }}</span>
            <select class="select" formControlName="branchId">
              @for (branch of options()?.branches ?? []; track branch.id) {
                <option [value]="branch.id">{{ branch.name }}</option>
              }
            </select>
            @if (editForm.controls.branchId.invalid && editForm.controls.branchId.touched) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.registrationNumber' | transloco }}</span>
            <input class="input" formControlName="registrationNumber" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.birthDate' | transloco }}</span>
            <input class="input" type="date" formControlName="birthDate" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.gender' | transloco }}</span>
            <select class="select" formControlName="gender">
              <option value="">{{ 'common.none' | transloco }}</option>
              <option value="male">{{ 'students.form.male' | transloco }}</option>
              <option value="female">{{ 'students.form.female' | transloco }}</option>
              <option value="other">{{ 'students.form.other' | transloco }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.email' | transloco }}</span>
            <input class="input" type="email" formControlName="email" />
            @if (editForm.controls.email.invalid && editForm.controls.email.touched) {
              <span class="field-error">{{ 'common.invalidEmail' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.phone' | transloco }}</span>
            <input class="input" type="tel" formControlName="phone" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.address' | transloco }}</span>
            <input class="input" formControlName="address" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.city' | transloco }}</span>
            <input class="input" formControlName="city" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'students.form.status' | transloco }}</span>
            <select class="select" formControlName="status">
              @for (option of statuses; track option) {
                <option [value]="option">{{ 'status.' + option | transloco }}</option>
              }
            </select>
          </label>
        </div>
        <label class="field">
          <span class="field-label">{{ 'students.form.notes' | transloco }}</span>
          <textarea class="textarea" formControlName="notes" rows="3"></textarea>
        </label>
        <div class="divider"></div>
        <div class="space-y-3">
          <label class="flex items-start gap-2.5 text-[13px] text-ink-2">
            <input
              type="checkbox"
              formControlName="consentData"
              class="mt-0.5 h-4 w-4 rounded border-line accent-[var(--accent)]"
            />
            <span>{{ 'students.form.consentData' | transloco }}</span>
          </label>
          <label class="flex items-start gap-2.5 text-[13px] text-ink-2">
            <input
              type="checkbox"
              formControlName="consentMedia"
              class="mt-0.5 h-4 w-4 rounded border-line accent-[var(--accent)]"
            />
            <span>{{ 'students.form.consentMedia' | transloco }}</span>
          </label>
        </div>
      </form>
      <div drawer-footer class="flex justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="closeEdit()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="submit"
          form="student-edit-form"
          class="btn btn-primary"
          [disabled]="saving()"
        >
          {{ (saving() ? 'common.saving' : 'common.save') | transloco }}
        </button>
      </div>
    </app-drawer>

    <app-drawer
      [open]="statusOpen()"
      title="students.detail.status.title"
      [subtitle]="'students.detail.status.message' | transloco"
      size="sm"
      [showFooter]="true"
      (closed)="closeStatus()"
    >
      <form
        id="student-status-form"
        [formGroup]="statusForm"
        (ngSubmit)="submitStatus()"
        class="space-y-4"
      >
        <label class="field">
          <span class="field-label">{{ 'students.form.status' | transloco }}</span>
          <select class="select" formControlName="status">
            @for (option of statuses; track option) {
              <option [value]="option">{{ 'status.' + option | transloco }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span class="field-label">{{ 'students.detail.status.reason' | transloco }}</span>
          <textarea class="textarea" formControlName="reason" rows="3"></textarea>
        </label>
      </form>
      <div drawer-footer class="flex justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="closeStatus()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="submit"
          form="student-status-form"
          class="btn btn-primary"
          [disabled]="saving()"
        >
          {{ (saving() ? 'common.saving' : 'common.save') | transloco }}
        </button>
      </div>
    </app-drawer>

    <app-drawer
      [open]="guardianOpen()"
      title="students.detail.guardians.form.title"
      size="md"
      [showFooter]="true"
      (closed)="closeGuardian()"
    >
      <form
        id="guardian-form"
        [formGroup]="guardianForm"
        (ngSubmit)="submitGuardian()"
        class="space-y-4"
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="field">
            <span class="field-label">{{
              'students.detail.guardians.form.firstName' | transloco
            }}</span>
            <input class="input" formControlName="firstName" />
            @if (
              guardianForm.controls.firstName.invalid && guardianForm.controls.firstName.touched
            ) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{
              'students.detail.guardians.form.lastName' | transloco
            }}</span>
            <input class="input" formControlName="lastName" />
            @if (guardianForm.controls.lastName.invalid && guardianForm.controls.lastName.touched) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{
              'students.detail.guardians.form.relationship' | transloco
            }}</span>
            <input class="input" formControlName="relationship" />
          </label>
          <label class="field">
            <span class="field-label">{{
              'students.detail.guardians.form.phone' | transloco
            }}</span>
            <input class="input" type="tel" formControlName="phone" />
          </label>
          <label class="field">
            <span class="field-label">{{
              'students.detail.guardians.form.email' | transloco
            }}</span>
            <input class="input" type="email" formControlName="email" />
            @if (guardianForm.controls.email.invalid && guardianForm.controls.email.touched) {
              <span class="field-error">{{ 'common.invalidEmail' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{
              'students.detail.guardians.form.taxId' | transloco
            }}</span>
            <input class="input" formControlName="taxId" />
          </label>
          <label class="field">
            <span class="field-label">{{
              'students.detail.guardians.form.occupation' | transloco
            }}</span>
            <input class="input" formControlName="occupation" />
          </label>
          <label class="field sm:col-span-2">
            <span class="field-label">{{
              'students.detail.guardians.form.address' | transloco
            }}</span>
            <input class="input" formControlName="address" />
          </label>
        </div>
        <label class="flex items-center gap-2.5 text-[13px] text-ink-2">
          <input
            type="checkbox"
            formControlName="isPrimary"
            class="h-4 w-4 rounded border-line accent-[var(--accent)]"
          />
          <span>{{ 'students.detail.guardians.form.primary' | transloco }}</span>
        </label>
      </form>
      <div drawer-footer class="flex justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="closeGuardian()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button type="submit" form="guardian-form" class="btn btn-primary" [disabled]="saving()">
          {{ (saving() ? 'common.saving' : 'common.add') | transloco }}
        </button>
      </div>
    </app-drawer>

    <app-drawer
      [open]="enrollmentOpen()"
      title="students.detail.enrollments.form.title"
      size="md"
      [showFooter]="true"
      (closed)="closeEnrollment()"
    >
      <form
        id="enrollment-form"
        [formGroup]="enrollmentForm"
        (ngSubmit)="submitEnrollment()"
        class="space-y-4"
      >
        <label class="field">
          <span class="field-label">{{
            'students.detail.enrollments.form.program' | transloco
          }}</span>
          <select class="select" formControlName="programId">
            <option value="">{{ 'common.none' | transloco }}</option>
            @for (program of options()?.programs ?? []; track program.id) {
              <option [value]="program.id">{{ program.name }}</option>
            }
          </select>
          @if (
            enrollmentForm.controls.programId.invalid && enrollmentForm.controls.programId.touched
          ) {
            <span class="field-error">{{ 'common.required' | transloco }}</span>
          }
        </label>
        <label class="field">
          <span class="field-label">{{
            'students.detail.enrollments.form.level' | transloco
          }}</span>
          <select class="select" formControlName="levelId">
            <option value="">{{ 'common.none' | transloco }}</option>
            @for (level of options()?.levels ?? []; track level.id) {
              <option [value]="level.id">{{ level.name }}</option>
            }
          </select>
          @if (enrollmentForm.controls.levelId.invalid && enrollmentForm.controls.levelId.touched) {
            <span class="field-error">{{ 'common.required' | transloco }}</span>
          }
        </label>
        <label class="field">
          <span class="field-label">{{ 'students.detail.enrollments.form.year' | transloco }}</span>
          <select class="select" formControlName="academicYearId">
            <option value="">{{ 'common.none' | transloco }}</option>
            @for (year of options()?.years ?? []; track year.id) {
              <option [value]="year.id">{{ year.name }}</option>
            }
          </select>
          @if (
            enrollmentForm.controls.academicYearId.invalid &&
            enrollmentForm.controls.academicYearId.touched
          ) {
            <span class="field-error">{{ 'common.required' | transloco }}</span>
          }
        </label>
        <label class="field">
          <span class="field-label">{{
            'students.detail.enrollments.form.branch' | transloco
          }}</span>
          <select class="select" formControlName="branchId">
            <option value="">{{ 'common.none' | transloco }}</option>
            @for (branch of options()?.branches ?? []; track branch.id) {
              <option [value]="branch.id">{{ branch.name }}</option>
            }
          </select>
          @if (
            enrollmentForm.controls.branchId.invalid && enrollmentForm.controls.branchId.touched
          ) {
            <span class="field-error">{{ 'common.required' | transloco }}</span>
          }
        </label>
        <label class="field">
          <span class="field-label">{{
            'students.detail.enrollments.form.teacher' | transloco
          }}</span>
          <select class="select" formControlName="teacherId">
            <option value="">{{ 'students.detail.enrollments.form.noTeacher' | transloco }}</option>
            @for (teacher of options()?.teachers ?? []; track teacher.id) {
              <option [value]="teacher.id">{{ teacher.firstName }} {{ teacher.lastName }}</option>
            }
          </select>
        </label>
      </form>
      <div drawer-footer class="flex justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="closeEnrollment()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button type="submit" form="enrollment-form" class="btn btn-primary" [disabled]="saving()">
          {{ (saving() ? 'common.saving' : 'common.add') | transloco }}
        </button>
      </div>
    </app-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentDetailPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);

  readonly format = inject(FormatService);

  readonly id = input.required<string>();

  readonly student = signal<StudentDetailData | null>(null);
  readonly loading = signal(true);
  readonly activeTab = signal<TabKey>('overview');
  readonly options = signal<AcademicsOptionsWithTeachers | null>(null);
  readonly ledger = signal<StudentLedger | null>(null);
  readonly ledgerLoading = signal(false);
  readonly documents = signal<DocumentRecord[] | null>(null);
  readonly documentsLoading = signal(false);
  readonly editOpen = signal(false);
  readonly statusOpen = signal(false);
  readonly guardianOpen = signal(false);
  readonly enrollmentOpen = signal(false);
  readonly saving = signal(false);

  readonly canWrite = computed(() => this.auth.has('students.write'));
  readonly canFinance = computed(() => this.auth.has('finance.read'));
  readonly canDocuments = computed(() => this.auth.has('documents.read'));
  readonly statuses: StudentStatus[] = ['ACTIVE', 'INACTIVE', 'GRADUATED', 'ARCHIVED'];

  readonly editForm = this.fb.nonNullable.group({
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

  readonly statusForm = this.fb.nonNullable.group({
    status: ['ACTIVE' as StudentStatus, [Validators.required]],
    reason: [''],
  });

  readonly guardianForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(80)]],
    relationship: [''],
    phone: [''],
    email: ['', [Validators.email]],
    taxId: [''],
    occupation: [''],
    address: [''],
    isPrimary: [false],
  });

  readonly enrollmentForm = this.fb.nonNullable.group({
    programId: ['', [Validators.required]],
    levelId: ['', [Validators.required]],
    academicYearId: ['', [Validators.required]],
    branchId: ['', [Validators.required]],
    teacherId: [''],
  });

  readonly activeEnrollments = computed(() =>
    (this.student()?.enrollments ?? []).filter((enrollment) => enrollment.status === 'ACTIVE'),
  );

  readonly recentAttendance = computed(() => (this.student()?.attendances ?? []).slice(0, 6));

  readonly attendanceSummary = computed(() => this.student()?.attendanceSummary ?? null);

  readonly attendanceBreakdown = computed<
    { status: AttendanceStatus; label: string; value: number }[]
  >(() => {
    const summary = this.student()?.attendanceSummary;
    return [
      { status: 'PRESENT', label: 'status.PRESENT', value: summary?.PRESENT ?? 0 },
      { status: 'ABSENT', label: 'status.ABSENT', value: summary?.ABSENT ?? 0 },
      { status: 'LATE', label: 'status.LATE', value: summary?.LATE ?? 0 },
      { status: 'EXCUSED', label: 'status.EXCUSED', value: summary?.EXCUSED ?? 0 },
    ];
  });

  readonly attendanceTone = computed<'success' | 'warning' | 'danger'>(() => {
    const rate = this.student()?.attendanceSummary?.rate ?? 0;
    if (rate >= 90) return 'success';
    if (rate >= 75) return 'warning';
    return 'danger';
  });

  readonly tabs = computed<TabItem[]>(() => {
    const student = this.student();
    const tabs: TabItem[] = [
      { key: 'overview', label: 'students.detail.tabs.overview', count: null },
      {
        key: 'guardians',
        label: 'students.detail.tabs.guardians',
        count: student?.guardians.length ?? 0,
      },
      {
        key: 'enrollments',
        label: 'students.detail.tabs.enrollments',
        count: student?.enrollments.length ?? 0,
      },
      {
        key: 'attendance',
        label: 'students.detail.tabs.attendance',
        count: student?.attendances.length ?? 0,
      },
    ];
    if (this.canFinance()) {
      tabs.push({
        key: 'finance',
        label: 'students.detail.tabs.finance',
        count: this.ledger()?.charges.length ?? null,
      });
    }
    if (this.canDocuments()) {
      tabs.push({
        key: 'documents',
        label: 'students.detail.tabs.documents',
        count: this.documents()?.length ?? null,
      });
    }
    return tabs;
  });

  private loadedId: string | null = null;
  private ledgerLoaded = false;
  private documentsLoaded = false;
  private loadSequence = 0;

  constructor() {
    effect(() => {
      const studentId = this.id();
      void this.load(studentId);
    });
    void this.loadOptions();
  }

  genderLabel(gender: string | null | undefined): string {
    switch (gender) {
      case 'male':
      case 'M':
        return 'students.form.male';
      case 'female':
      case 'F':
        return 'students.form.female';
      case 'other':
      case 'O':
        return 'students.form.other';
      default:
        return 'common.none';
    }
  }

  teacherName(enrollment: Enrollment): string {
    const teacher = enrollment.teacher;
    return teacher ? `${teacher.firstName} ${teacher.lastName}` : '—';
  }

  branchName(enrollment: Enrollment): string {
    const branch = (enrollment as Enrollment & { branch?: { name: string } }).branch;
    return (
      branch?.name ??
      this.options()?.branches.find((item) => item.id === enrollment.branchId)?.name ??
      this.student()?.branch?.name ??
      '—'
    );
  }

  attendanceDate(record: Attendance): string {
    return this.format.dateTime(record.lesson?.startsAt ?? record.markedAt);
  }

  selectTab(tab: TabKey): void {
    this.activeTab.set(tab);
    const student = this.student();
    if (!student) return;
    if (tab === 'finance') void this.loadLedger(student.id);
    if (tab === 'documents') void this.loadDocuments(student.id);
  }

  openFinanceTab(): void {
    this.selectTab('finance');
  }

  openEdit(): void {
    const student = this.student();
    if (!student) return;
    this.editForm.reset({
      firstName: student.firstName,
      lastName: student.lastName,
      branchId: student.branchId,
      registrationNumber: student.registrationNumber,
      birthDate: student.birthDate?.slice(0, 10) ?? '',
      gender: this.genderValue(student.gender),
      email: student.email ?? '',
      phone: student.phone ?? '',
      address: student.address ?? '',
      city: student.city ?? '',
      status: student.status,
      notes: student.notes ?? '',
      consentData: student.consentData,
      consentMedia: student.consentMedia,
    });
    this.editOpen.set(true);
  }

  closeEdit(): void {
    if (!this.saving()) this.editOpen.set(false);
  }

  async submitEdit(): Promise<void> {
    const student = this.student();
    if (!student || this.saving()) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.api.patch(`/students/${student.id}`, this.studentPayload(this.editForm.getRawValue())),
      );
      this.toast.success(this.transloco.translate('students.form.saved'));
      this.editOpen.set(false);
      await this.load(student.id);
    } catch {
      // Errors are surfaced globally by the HTTP error interceptor.
    } finally {
      this.saving.set(false);
    }
  }

  openStatus(): void {
    const student = this.student();
    if (!student) return;
    this.statusForm.reset({ status: student.status, reason: '' });
    this.statusOpen.set(true);
  }

  closeStatus(): void {
    if (!this.saving()) this.statusOpen.set(false);
  }

  async submitStatus(): Promise<void> {
    const student = this.student();
    if (!student || this.saving()) return;
    if (this.statusForm.invalid) {
      this.statusForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const value = this.statusForm.getRawValue();
      const payload: StatusPayload = { status: value.status };
      const reason = value.reason.trim();
      if (reason) payload.reason = reason;
      await firstValueFrom(this.api.patch(`/students/${student.id}/status`, payload));
      this.toast.success(this.transloco.translate('students.detail.status.saved'));
      this.statusOpen.set(false);
      await this.load(student.id);
    } catch {
      // Errors are surfaced globally by the HTTP error interceptor.
    } finally {
      this.saving.set(false);
    }
  }

  openGuardian(): void {
    this.guardianForm.reset({
      firstName: '',
      lastName: '',
      relationship: '',
      phone: '',
      email: '',
      taxId: '',
      occupation: '',
      address: '',
      isPrimary: false,
    });
    this.guardianOpen.set(true);
  }

  closeGuardian(): void {
    if (!this.saving()) this.guardianOpen.set(false);
  }

  async submitGuardian(): Promise<void> {
    const student = this.student();
    if (!student || this.saving()) return;
    if (this.guardianForm.invalid) {
      this.guardianForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const value = this.guardianForm.getRawValue();
      const payload: GuardianPayload = {
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        isPrimary: value.isPrimary,
      };
      const relationship = value.relationship.trim();
      if (relationship) payload.relationship = relationship;
      const phone = value.phone.trim();
      if (phone) payload.phone = phone;
      const email = value.email.trim();
      if (email) payload.email = email;
      const taxId = value.taxId.trim();
      if (taxId) payload.taxId = taxId;
      const occupation = value.occupation.trim();
      if (occupation) payload.occupation = occupation;
      const address = value.address.trim();
      if (address) payload.address = address;
      await firstValueFrom(this.api.post(`/students/${student.id}/guardians`, payload));
      this.toast.success(this.transloco.translate('students.detail.guardians.form.saved'));
      this.guardianOpen.set(false);
      await this.load(student.id);
    } catch {
      // Errors are surfaced globally by the HTTP error interceptor.
    } finally {
      this.saving.set(false);
    }
  }

  async removeGuardian(relation: StudentGuardian): Promise<void> {
    const student = this.student();
    if (!student || !this.canWrite()) return;
    const confirmed = await this.confirm.confirm({
      title: this.transloco.translate('students.detail.guardians.removeConfirm'),
      message: this.transloco.translate('students.detail.guardians.removeMessage'),
      confirmLabel: this.transloco.translate('common.remove'),
      cancelLabel: this.transloco.translate('common.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await firstValueFrom(this.api.delete(`/students/${student.id}/guardians/${relation.id}`));
      this.toast.success(this.transloco.translate('common.deleted'));
      await this.load(student.id);
    } catch {
      // Errors are surfaced globally by the HTTP error interceptor.
    }
  }

  openEnrollment(): void {
    const student = this.student();
    if (!student) return;
    const options = this.options();
    const year = options?.activeYear ?? options?.years.find((item) => item.isActive) ?? null;
    this.enrollmentForm.reset({
      programId: '',
      levelId: '',
      academicYearId: year?.id ?? '',
      branchId: student.branchId,
      teacherId: '',
    });
    this.enrollmentOpen.set(true);
  }

  closeEnrollment(): void {
    if (!this.saving()) this.enrollmentOpen.set(false);
  }

  async submitEnrollment(): Promise<void> {
    const student = this.student();
    if (!student || this.saving()) return;
    if (this.enrollmentForm.invalid) {
      this.enrollmentForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const value = this.enrollmentForm.getRawValue();
      const payload: EnrollmentPayload = {
        programId: value.programId,
        levelId: value.levelId,
        academicYearId: value.academicYearId,
        branchId: value.branchId,
      };
      if (value.teacherId) payload.teacherId = value.teacherId;
      await firstValueFrom(this.api.post(`/students/${student.id}/enrollments`, payload));
      this.toast.success(this.transloco.translate('students.detail.enrollments.form.saved'));
      this.enrollmentOpen.set(false);
      await this.load(student.id);
    } catch {
      // Errors are surfaced globally by the HTTP error interceptor.
    } finally {
      this.saving.set(false);
    }
  }

  private genderValue(gender: string | null | undefined): string {
    switch (gender) {
      case 'male':
      case 'M':
        return 'male';
      case 'female':
      case 'F':
        return 'female';
      case 'other':
      case 'O':
        return 'other';
      default:
        return '';
    }
  }

  private studentPayload(value: StudentFormValue): UpdateStudentPayload {
    const payload: UpdateStudentPayload = {
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      branchId: value.branchId,
      status: value.status,
      consentData: value.consentData,
      consentMedia: value.consentMedia,
    };
    const registrationNumber = value.registrationNumber.trim();
    if (registrationNumber) payload.registrationNumber = registrationNumber;
    payload.birthDate = value.birthDate || null;
    payload.gender = value.gender || null;
    payload.email = value.email.trim() || null;
    payload.phone = value.phone.trim() || null;
    payload.address = value.address.trim() || null;
    payload.city = value.city.trim() || null;
    payload.notes = value.notes.trim() || null;
    return payload;
  }

  private async load(studentId: string): Promise<void> {
    if (!studentId) return;
    const sequence = ++this.loadSequence;
    if (this.loadedId !== studentId) {
      this.loadedId = studentId;
      this.activeTab.set('overview');
      this.ledger.set(null);
      this.documents.set(null);
      this.ledgerLoaded = false;
      this.documentsLoaded = false;
    }
    this.loading.set(true);
    try {
      const student = await firstValueFrom(
        this.api.get<StudentDetailData>(`/students/${studentId}`),
      );
      if (sequence !== this.loadSequence) return;
      this.student.set(student);
      if (this.activeTab() === 'finance') void this.loadLedger(studentId);
      if (this.activeTab() === 'documents') void this.loadDocuments(studentId);
    } catch {
      // Errors are surfaced globally by the HTTP error interceptor.
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }

  private async loadOptions(): Promise<void> {
    try {
      this.options.set(
        await firstValueFrom(this.api.get<AcademicsOptionsWithTeachers>('/academics/options')),
      );
    } catch {
      // Options are optional; read-only roles may not have academics access.
    }
  }

  private async loadLedger(studentId: string): Promise<void> {
    if (this.ledgerLoaded) return;
    this.ledgerLoaded = true;
    this.ledgerLoading.set(true);
    try {
      const ledger = await firstValueFrom(
        this.api.get<StudentLedger>(`/finance/students/${studentId}/ledger`),
      );
      if (this.loadedId === studentId) this.ledger.set(ledger);
    } catch {
      this.ledgerLoaded = false;
      // Errors are surfaced globally by the HTTP error interceptor.
    } finally {
      this.ledgerLoading.set(false);
    }
  }

  private async loadDocuments(studentId: string): Promise<void> {
    if (this.documentsLoaded) return;
    this.documentsLoaded = true;
    this.documentsLoading.set(true);
    try {
      const documents = await firstValueFrom(
        this.api.get<DocumentRecord[]>(`/students/${studentId}/documents`),
      );
      if (this.loadedId === studentId) this.documents.set(documents);
    } catch {
      this.documentsLoaded = false;
      // Errors are surfaced globally by the HTTP error interceptor.
    } finally {
      this.documentsLoading.set(false);
    }
  }
}
