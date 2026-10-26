import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { EChartsCoreOption } from 'echarts/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { FormatService } from '../../core/format.service';
import { LanguageService } from '../../core/language.service';
import type {
  AdministratorDashboard,
  Announcement,
  DashboardData,
  DashboardLesson,
  DirectorDashboard,
  GuardianDashboard,
  StudentDashboard,
  TeacherDashboard,
} from '../../core/models';
import { PortalContextService } from '../../core/portal-context.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';
import { PortalChildSelectorComponent } from '../portal/portal-child-selector';
import { DailyDigestModalComponent } from './daily-digest-modal';

const BRASS = '#b9893d';
const GREEN = '#2f7d5d';
const SLATE = '#8b949e';
const GRID = '#8b949e33';

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

interface StatItem {
  label: string;
  value: string;
  icon: string;
  tone: Tone;
  hint?: string;
}

interface QuickAction {
  label: string;
  link: string;
  icon: string;
  primary?: boolean;
}

@Component({
  selector: 'app-dashboard',
  imports: [SHARED_IMPORTS, PortalChildSelectorComponent, DailyDigestModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-page-header [title]="greeting()" [translateTitle]="false" [subtitle]="subtitle()" eyebrow="dashboard.eyebrow">
        @if (roleKey() === 'DIRECTOR' || roleKey() === 'ADMINISTRATOR') {
          <button
            type="button"
            class="btn btn-secondary flex items-center gap-1.5"
            (click)="showDailyDigestModal.set(true)"
          >
            <app-icon name="sparkles" [size]="15" />
            <span>{{ 'dashboard.actions.dailyDigest' | transloco }}</span>
          </button>
        }
        @for (action of headerActions(); track action.link) {
          <a
            class="btn"
            [class.btn-primary]="action.primary"
            [class.btn-secondary]="!action.primary"
            [routerLink]="action.link"
          >
            <app-icon [name]="action.icon" [size]="15" />
            {{ action.label | transloco }}
          </a>
        }
      </app-page-header>

      @if (loading()) {
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton h-[124px]"></div>
          }
        </div>
        <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div class="skeleton h-[300px]"></div>
          <div class="skeleton h-[300px]"></div>
        </div>
      } @else {
        <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          @for (stat of stats(); track stat.label) {
            <app-stat-card [label]="stat.label" [value]="stat.value" [icon]="stat.icon" [tone]="stat.tone" [hint]="stat.hint" />
          }
        </div>

        @if (director(); as d) {
          <!-- Director -->
          <section class="card mb-4 grid grid-cols-1 divide-y divide-line overflow-hidden sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div class="px-5 py-4">
              <p class="text-[12px] font-medium text-ink-3">{{ 'dashboard.stats.outstanding' | transloco }}</p>
              <p class="mt-1.5 text-xl font-semibold tabular-nums">{{ format.money(d.stats.outstanding) }}</p>
              <p class="mt-1 text-[11px] text-ink-3">{{ 'dashboard.hints.balance' | transloco }}</p>
            </div>
            <div class="px-5 py-4">
              <p class="text-[12px] font-medium text-ink-3">{{ 'dashboard.stats.overdue' | transloco }}</p>
              <p class="mt-1.5 text-xl font-semibold tabular-nums text-danger">{{ format.money(d.stats.overdue) }}</p>
              <p class="mt-1 text-[11px] text-ink-3">{{ tr('dashboard.hints.overdueCount', { count: d.stats.overdueCount }) }}</p>
            </div>
            <div class="px-5 py-4">
              <p class="text-[12px] font-medium text-ink-3">{{ 'dashboard.stats.collectionRate' | transloco }}</p>
              <p class="mt-1.5 text-xl font-semibold tabular-nums">{{ format.percent(d.stats.collectionRate) }}</p>
              <app-progress class="mt-2 block" [value]="d.stats.collectionRate" tone="success" />
            </div>
          </section>

          <div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.enrollmentTrend' }" />
              <div class="p-4">
                @if (enrollmentChart(); as options) {
                  <app-chart [options]="options" [height]="230" />
                }
              </div>
            </section>
            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.financeSnapshot' }" />
              <div class="p-4">
                @if (financeChart(); as options) {
                  <app-chart [options]="options" [height]="230" />
                }
              </div>
            </section>
          </div>

          <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <section class="card min-w-0 xl:col-span-2">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.todayLessons', link: '/app/schedule' }" />
              <ng-container [ngTemplateOutlet]="lessonList" [ngTemplateOutletContext]="{ $implicit: d.todayLessons, showTeacher: true, empty: 'dashboard.empty.todayLessons' }" />
            </section>

            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.branchBreakdown' }" />
              @for (branch of d.branchBreakdown; track branch.id) {
                <div class="border-t border-line px-5 py-3.5 first:border-t-0">
                  <div class="flex items-baseline justify-between gap-2">
                    <p class="min-w-0 truncate text-[13px] font-semibold">
                      {{ branch.name }} <span class="text-[10.5px] font-medium text-ink-3">{{ branch.code }}</span>
                    </p>
                    <span class="shrink-0 text-[11.5px] font-semibold tabular-nums">{{ 'dashboard.branchStudents' | transloco: { count: branch.students } }}</span>
                  </div>
                  <p class="mt-0.5 text-[11px] text-ink-3">
                    {{ 'dashboard.branchSeries' | transloco: { count: branch.series } }} ·
                    {{ 'dashboard.branchRooms' | transloco: { count: branch.rooms } }}
                  </p>
                  <div class="mt-2 flex items-center gap-2">
                    <app-progress class="flex-1" [value]="branchShare(branch.students, d.branchBreakdown)" tone="accent" />
                    <span class="w-8 text-right text-[10.5px] tabular-nums text-ink-3">{{ format.percent(branchShare(branch.students, d.branchBreakdown)) }}</span>
                  </div>
                </div>
              } @empty {
                <app-empty-state title="common.noResults" icon="building" />
              }
            </section>

            <section class="card min-w-0 xl:col-span-2">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.atRisk' }" />
              @for (row of d.atRiskStudents; track row.id) {
                <a [routerLink]="['/app/students', row.id]" class="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0 hover:bg-surface-2">
                  <app-avatar [firstName]="row.firstName" [lastName]="row.lastName" [size]="32" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[13px] font-semibold">{{ row.firstName }} {{ row.lastName }}</p>
                    <p class="text-[10.5px] text-ink-3">{{ 'dashboard.studentCode' | transloco: { number: row.registrationNumber } }}</p>
                    <app-progress class="mt-1.5 block" [value]="row.rate" [tone]="rateTone(row.rate)" />
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="text-[13px] font-semibold tabular-nums">{{ format.percent(row.rate) }}</p>
                    <p class="text-[10.5px] text-ink-3">{{ 'dashboard.atRiskLine' | transloco: { absences: row.absences, total: row.total } }}</p>
                  </div>
                </a>
              } @empty {
                <app-empty-state title="dashboard.empty.atRisk" icon="users" />
              }
            </section>

            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.recentAnnouncements', link: '/app/announcements' }" />
              <ng-container [ngTemplateOutlet]="announcementList" [ngTemplateOutletContext]="{ $implicit: d.recentAnnouncements, empty: 'dashboard.empty.announcements' }" />
            </section>
          </div>
        } @else if (administrator(); as a) {
          <!-- Administrator -->
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <section class="card min-w-0 xl:col-span-2">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.todayLessons', link: '/app/schedule' }" />
              <ng-container [ngTemplateOutlet]="lessonList" [ngTemplateOutletContext]="{ $implicit: a.todayLessons, showTeacher: true, empty: 'dashboard.empty.todayLessons' }" />
            </section>

            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.quickActions' }" />
              <div class="grid grid-cols-2 gap-2 p-4">
                @for (action of adminActions; track action.link) {
                  <a class="btn h-auto flex-col gap-1.5 py-3.5" [class.btn-primary]="action.primary" [class.btn-secondary]="!action.primary" [routerLink]="action.link">
                    <app-icon [name]="action.icon" [size]="18" />
                    <span>{{ action.label | transloco }}</span>
                  </a>
                }
              </div>
            </section>

            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.topDebtors', link: '/app/finance' }" />
              @for (debtor of a.topDebtors; track debtor.studentId) {
                <a routerLink="/app/finance" class="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0 hover:bg-surface-2">
                  <app-avatar [firstName]="debtor.student.firstName" [lastName]="debtor.student.lastName" [size]="30" />
                  <p class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ debtor.student.firstName }} {{ debtor.student.lastName }}</p>
                  <span class="shrink-0 text-[12.5px] font-semibold tabular-nums text-danger">{{ format.money(debtor.balance) }}</span>
                </a>
              } @empty {
                <app-empty-state title="dashboard.empty.debtors" icon="wallet" />
              }
            </section>

            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.recentPayments', link: '/app/finance' }" />
              @for (payment of a.recentPayments; track payment.id) {
                <div class="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0">
                  <app-avatar [firstName]="payment.student?.firstName ?? '?'" [lastName]="payment.student?.lastName ?? ''" [size]="30" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[13px] font-medium">{{ payment.student?.firstName }} {{ payment.student?.lastName }}</p>
                    <p class="text-[10.5px] text-ink-3">{{ ('paymentMethod.' + payment.method) | transloco }} · {{ format.date(payment.paidAt, 'dayMonth') }}</p>
                  </div>
                  <span class="shrink-0 text-[12.5px] font-semibold tabular-nums">{{ format.money(payment.amount) }}</span>
                </div>
              } @empty {
                <app-empty-state title="dashboard.empty.payments" icon="receipt" />
              }
            </section>

            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.recentAnnouncements', link: '/app/announcements' }" />
              <ng-container [ngTemplateOutlet]="announcementList" [ngTemplateOutletContext]="{ $implicit: a.recentAnnouncements, empty: 'dashboard.empty.announcements' }" />
            </section>
          </div>
        } @else if (teacher(); as t) {
          <!-- Teacher -->
          <section class="card mb-4 flex flex-wrap items-center gap-4 px-5 py-4">
            <app-avatar [firstName]="t.teacher?.firstName ?? '?'" [lastName]="t.teacher?.lastName ?? ''" [size]="46" />
            <div class="min-w-0 flex-1">
              <p class="eyebrow">{{ 'roles.TEACHER' | transloco }}</p>
              <p class="mt-0.5 text-lg font-semibold">{{ t.teacher?.firstName }} {{ t.teacher?.lastName }}</p>
              @if (t.teacher?.title) {
                <p class="text-[12.5px] text-ink-2">{{ t.teacher.title }}</p>
              }
            </div>
            @if (t.stats.attendanceRate !== null) {
              <span class="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[12px]">
                {{ 'dashboard.stats.attendanceRate' | transloco }}:
                <span class="font-semibold tabular-nums">{{ format.percent(t.stats.attendanceRate) }}</span>
              </span>
            }
          </section>

          <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.todayLessons', link: '/app/attendance', linkLabel: 'dashboard.actions.markAttendance' }" />
              <ng-container [ngTemplateOutlet]="lessonList" [ngTemplateOutletContext]="{ $implicit: t.todayLessons, empty: 'dashboard.empty.todayLessons' }" />
            </section>

            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.weekLessons', link: '/app/schedule' }" />
              <ng-container [ngTemplateOutlet]="lessonList" [ngTemplateOutletContext]="{ $implicit: t.weekLessons, showDate: true, empty: 'dashboard.empty.weekLessons' }" />
            </section>

            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.attendanceHighlights' }" />
              @for (row of t.attendanceHighlights; track row.id) {
                <a [routerLink]="['/app/students', row.id]" class="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0 hover:bg-surface-2">
                  <app-avatar [firstName]="row.firstName" [lastName]="row.lastName" [size]="30" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[13px] font-medium">{{ row.firstName }} {{ row.lastName }}</p>
                    <app-progress class="mt-1.5 block" [value]="row.rate" [tone]="rateTone(row.rate)" />
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="text-[12.5px] font-semibold tabular-nums">{{ format.percent(row.rate) }}</p>
                    <p class="text-[10.5px] text-ink-3">{{ 'portal.attendance.absent' | transloco }}: {{ format.number(row.absences) }}</p>
                  </div>
                </a>
              } @empty {
                <app-empty-state title="dashboard.hints.noAttendance" icon="users" />
              }
            </section>

            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.recentAnnouncements', link: '/app/announcements' }" />
              <ng-container [ngTemplateOutlet]="announcementList" [ngTemplateOutletContext]="{ $implicit: t.recentAnnouncements, empty: 'dashboard.empty.announcements' }" />
            </section>
          </div>
        } @else if (portalView(); as s) {
          <!-- Student / guardian-selected child -->
          <app-portal-child-selector />
          <section class="mb-4 overflow-hidden rounded-2xl border border-sidebar-line bg-sidebar text-sidebar-ink-strong shadow-card">
            <div class="flex items-stretch">
              <div class="w-1 shrink-0 bg-accent"></div>
              <div class="min-w-0 flex-1 p-5 sm:p-7">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{{ 'dashboard.sections.nextLesson' | transloco }}</p>
                @if (s.nextLesson; as next) {
                  <p class="mt-2 text-2xl font-semibold tracking-tight sm:text-[32px]">{{ next.title }}</p>
                  <p class="mt-2 text-[13.5px] text-sidebar-ink">
                    {{
                      'dashboard.nextLessonIn'
                        | transloco
                          : { date: format.date(next.startsAt, 'long'), time: format.timeRange(next.startsAt, next.endsAt) }
                    }}
                  </p>
                  <div class="mt-3 flex flex-wrap gap-2 text-[12px]">
                    @if (next.room?.name) {
                      <span class="rounded-full border border-sidebar-line px-2.5 py-1 text-sidebar-ink">{{ 'dashboard.joinRoom' | transloco: { room: next.room.name } }}</span>
                    }
                    @if (next.teacher) {
                      <span class="rounded-full border border-sidebar-line px-2.5 py-1 text-sidebar-ink">
                        {{ 'dashboard.withTeacher' | transloco: { name: next.teacher.firstName + ' ' + next.teacher.lastName } }}
                      </span>
                    }
                  </div>
                } @else {
                  <p class="mt-2 text-xl font-semibold">{{ 'dashboard.empty.weekLessons' | transloco }}</p>
                }
                <div class="mt-4 flex flex-wrap gap-2">
                  @for (link of portalLinks; track link.link) {
                    <a [routerLink]="link.link" class="rounded-lg border border-sidebar-line px-3 py-1.5 text-[12px] font-medium text-sidebar-ink transition-colors hover:border-accent/50 hover:text-sidebar-ink-strong">
                      {{ link.label | transloco }}
                    </a>
                  }
                </div>
              </div>
            </div>
          </section>

          <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.weekSchedule', link: '/app/portal/schedule' }" />
              <ng-container [ngTemplateOutlet]="lessonList" [ngTemplateOutletContext]="{ $implicit: s.weekLessons, showTeacher: true, link: '/app/portal/schedule', empty: 'dashboard.empty.weekLessons' }" />
            </section>

            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.recentAttendance', link: '/app/portal/attendance' }" />
              @for (row of s.recentAttendance; track row.id) {
                <a routerLink="/app/portal/attendance" class="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0 hover:bg-surface-2">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[13px] font-semibold">{{ row.lesson?.title ?? '—' }}</p>
                    <p class="text-[10.5px] text-ink-3">{{ format.date(row.lesson?.startsAt) }}</p>
                  </div>
                  <app-status-badge [status]="row.status" />
                </a>
              } @empty {
                <app-empty-state title="dashboard.empty.attendance" icon="check-circle" />
              }
            </section>

            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.latestResults', link: '/app/portal/results' }" />
              @for (result of s.latestResults; track result.id) {
                <a routerLink="/app/portal/results" class="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0 hover:bg-surface-2">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[13px] font-semibold">{{ result.exam?.title ?? '—' }}</p>
                    <p class="text-[10.5px] text-ink-3">{{ result.exam?.program?.name ?? '' }}</p>
                  </div>
                  <span class="shrink-0 text-[13px] font-semibold tabular-nums">{{ result.grade }}</span>
                  <app-status-badge [status]="result.outcome" />
                </a>
              } @empty {
                <app-empty-state title="dashboard.empty.results" icon="award" />
              }
            </section>

            <section class="card">
              <ng-container [ngTemplateOutlet]="cardHead" [ngTemplateOutletContext]="{ $implicit: 'dashboard.sections.recentAnnouncements', link: '/app/announcements' }" />
              <ng-container [ngTemplateOutlet]="announcementList" [ngTemplateOutletContext]="{ $implicit: s.recentAnnouncements, empty: 'dashboard.empty.announcements' }" />
            </section>
          </div>
        } @else {
          <app-empty-state title="common.noResults" message="dashboard.empty.todayLessons" icon="dashboard" />
        }
      }
      @if (showDailyDigestModal()) {
        <app-daily-digest-modal (close)="showDailyDigestModal.set(false)" />
      }
    </div>

    <ng-template #cardHead let-title let-link="link" let-linkLabel="linkLabel">
      <div class="card-head">
        <h2 class="text-sm font-semibold">{{ title | transloco }}</h2>
        @if (link) {
          <a class="text-[12px] font-semibold text-accent-strong hover:underline" [routerLink]="link">
            {{ (linkLabel || 'common.viewAll') | transloco }}
          </a>
        }
      </div>
    </ng-template>

    <ng-template #lessonList let-lessons let-showTeacher="showTeacher" let-showDate="showDate" let-link="link" let-empty="empty">
      @for (lesson of lessons; track lesson.id) {
        <ng-container
          [ngTemplateOutlet]="lessonRow"
          [ngTemplateOutletContext]="{ $implicit: lesson, showTeacher: showTeacher, showDate: showDate, link: link }"
        />
      } @empty {
        <app-empty-state [title]="empty" icon="calendar" />
      }
    </ng-template>

    <ng-template #lessonRow let-lesson let-showTeacher="showTeacher" let-showDate="showDate" let-link="link">
      <a [routerLink]="link || '/app/schedule'" class="group flex items-center gap-3 border-t border-line px-5 py-3 transition-colors first:border-t-0 hover:bg-surface-2">
        <div class="w-[82px] shrink-0">
          @if (showDate) {
            <p class="text-[10px] font-medium uppercase tracking-wide text-ink-3">{{ format.date(lesson.startsAt, 'weekday') }}</p>
          }
          <p class="text-[12.5px] font-semibold tabular-nums">{{ format.timeRange(lesson.startsAt, lesson.endsAt) }}</p>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            @if (lesson.lessonSeries?.program?.color) {
              <span class="h-1.5 w-1.5 shrink-0 rounded-full" [style.background]="lesson.lessonSeries?.program?.color"></span>
            }
            <p class="truncate text-[13px] font-semibold">{{ lesson.title }}</p>
          </div>
          <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-3">
            @if (lesson.room?.name) {
              <span>{{ lesson.room?.name }}</span>
            }
            @if (showTeacher && lesson.teacher) {
              <span>{{ lesson.teacher.firstName }} {{ lesson.teacher.lastName }}</span>
            }
            @if (lessonStudents(lesson) > 0) {
              <span>{{ 'dashboard.lessonStudents' | transloco: { count: lessonStudents(lesson) } }}</span>
            }
          </p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          <app-status-badge [status]="lesson.status" />
          @if (isUnmarked(lesson)) {
            <span class="text-[10px] font-medium text-warning">{{ 'dashboard.unmarked' | transloco }}</span>
          }
        </div>
      </a>
    </ng-template>

    <ng-template #announcementList let-items let-empty="empty">
      @for (item of items; track item.id) {
        <ng-container [ngTemplateOutlet]="announcementItem" [ngTemplateOutletContext]="{ $implicit: item }" />
      } @empty {
        <app-empty-state [title]="empty" icon="megaphone" />
      }
    </ng-template>

    <ng-template #announcementItem let-item>
      <a routerLink="/app/announcements" class="block border-t border-line px-5 py-3.5 transition-colors first:border-t-0 hover:bg-surface-2">
        <div class="flex items-start gap-2">
          @if (item.isPinned) {
            <app-icon name="pin" [size]="13" class="mt-0.5 shrink-0 text-accent" />
          }
          <p class="min-w-0 flex-1 truncate text-[13px] font-semibold">{{ item.title }}</p>
          <span class="shrink-0 text-[10.5px] text-ink-3">{{ format.timeAgo(item.publishedAt) }}</span>
        </div>
        <p class="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-2">{{ item.body }}</p>
        <p class="mt-1 text-[10.5px] text-ink-3">{{ 'announcements.author' | transloco: { name: authorName(item) } }}</p>
      </a>
    </ng-template>
  `,
})
export class DashboardPage {
  readonly showDailyDigestModal = signal<boolean>(false);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  protected readonly portal = inject(PortalContextService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  protected readonly format = inject(FormatService);

  protected readonly data = signal<DashboardData | null>(null);
  protected readonly loading = signal(true);
  private readonly now = Date.now();

  protected readonly adminActions: QuickAction[] = [
    { label: 'dashboard.actions.addStudent', link: '/app/students', icon: 'user-plus' },
    { label: 'dashboard.actions.openSchedule', link: '/app/schedule', icon: 'calendar' },
    { label: 'dashboard.actions.markAttendance', link: '/app/attendance', icon: 'check-circle' },
    { label: 'dashboard.actions.newAnnouncement', link: '/app/announcements', icon: 'megaphone', primary: true },
  ];

  protected readonly portalLinks: QuickAction[] = [
    { label: 'nav.portalSchedule', link: '/app/portal/schedule', icon: 'calendar' },
    { label: 'nav.portalAttendance', link: '/app/portal/attendance', icon: 'check-circle' },
    { label: 'nav.portalResults', link: '/app/portal/results', icon: 'award' },
    { label: 'nav.portalFinance', link: '/app/portal/finance', icon: 'wallet' },
  ];

  protected readonly firstName = computed(() => this.auth.user()?.firstName ?? '');
  protected readonly roleKey = computed(() => this.auth.role() ?? this.data()?.role ?? 'DIRECTOR');
  protected readonly subtitle = computed(() => `dashboard.subtitle.${this.roleKey()}`);
  protected readonly greeting = computed(() => {
    this.language.current();
    return this.transloco.translate('dashboard.greeting', { name: this.firstName() });
  });

  protected readonly headerActions = computed<QuickAction[]>(() => {
    const schedule: QuickAction = { label: 'dashboard.actions.openSchedule', link: '/app/schedule', icon: 'calendar' };
    const attendance: QuickAction = { label: 'dashboard.actions.markAttendance', link: '/app/attendance', icon: 'check-circle' };
    switch (this.roleKey()) {
      case 'STUDENT':
      case 'GUARDIAN':
        return [{ label: 'dashboard.actions.openSchedule', link: '/app/portal/schedule', icon: 'calendar', primary: true }];
      case 'TEACHER':
        return [schedule, attendance];
      default:
        return [schedule, attendance, { label: 'dashboard.actions.addStudent', link: '/app/students', icon: 'user-plus', primary: true }];
    }
  });

  protected readonly director = computed<DirectorDashboard | null>(() => {
    const value = this.data();
    return value?.role === 'DIRECTOR' ? value : null;
  });
  protected readonly administrator = computed<AdministratorDashboard | null>(() => {
    const value = this.data();
    return value?.role === 'ADMINISTRATOR' ? value : null;
  });
  protected readonly teacher = computed<TeacherDashboard | null>(() => {
    const value = this.data();
    return value?.role === 'TEACHER' ? value : null;
  });
  protected readonly student = computed<StudentDashboard | null>(() => {
    const value = this.data();
    return value?.role === 'STUDENT' ? value : null;
  });
  protected readonly guardian = computed<GuardianDashboard | null>(() => {
    const value = this.data();
    return value?.role === 'GUARDIAN' ? value : null;
  });
  /**
   * Guardian dashboard reuse: a guardian sees the exact student dashboard of
   * the selected child (same cards, same shapes), picked via the shared
   * portal child selector backed by `guardianChildIds` on the API.
   */
  protected readonly portalView = computed<StudentDashboard | null>(() => {
    const direct = this.student();
    if (direct) return direct;
    const guardian = this.guardian();
    if (!guardian?.children?.length) return null;
    const selected = this.portal.selectedId();
    return (
      guardian.children.find((child) => child.student?.id === selected) ??
      guardian.children[0] ??
      null
    );
  });

  protected readonly stats = computed<StatItem[]>(() => {
    this.language.current();
    const d = this.director();
    if (d) {
      return [
        { label: 'dashboard.stats.activeStudents', value: this.format.number(d.stats.activeStudents), icon: 'users', tone: 'accent' },
        { label: 'dashboard.stats.activeTeachers', value: this.format.number(d.stats.activeTeachers), icon: 'graduation', tone: 'info' },
        { label: 'dashboard.stats.attendanceRate', value: this.format.percent(d.stats.attendanceRate), icon: 'check-circle', tone: 'success', hint: this.tr('dashboard.hints.attendanceMarked', { count: d.stats.attendanceMarked }) },
        { label: 'dashboard.stats.collected', value: this.format.money(d.stats.collected), icon: 'wallet', tone: 'accent', hint: this.tr('dashboard.hints.thisMonth') },
      ];
    }
    const a = this.administrator();
    if (a) {
      return [
        { label: 'dashboard.stats.lessonsToday', value: this.format.number(a.stats.lessonsToday), icon: 'calendar', tone: 'accent' },
        { label: 'dashboard.stats.unmarkedPast', value: this.format.number(a.stats.unmarkedPast), icon: 'clock', tone: 'warning', hint: this.tr('dashboard.hints.unmarked') },
        { label: 'dashboard.stats.newStudentsThisMonth', value: this.format.number(a.stats.newStudentsThisMonth), icon: 'user-plus', tone: 'info', hint: this.tr('dashboard.hints.thisMonth') },
        { label: 'dashboard.stats.overdueCharges', value: this.format.number(a.stats.overdueCharges), icon: 'alert', tone: 'danger', hint: this.tr('dashboard.hints.overdueCount', { count: a.stats.overdueCharges }) },
      ];
    }
    const t = this.teacher();
    if (t) {
      return [
        { label: 'dashboard.stats.lessonsToday', value: this.format.number(t.stats.lessonsToday), icon: 'calendar', tone: 'accent' },
        { label: 'dashboard.stats.lessonsThisWeek', value: this.format.number(t.stats.lessonsThisWeek), icon: 'book', tone: 'info' },
        { label: 'dashboard.stats.hoursThisWeek', value: this.tr('dashboard.hoursValue', { value: this.format.number(t.stats.hoursThisWeek, 1) }), icon: 'clock', tone: 'success' },
        { label: 'dashboard.stats.assignedStudents', value: this.format.number(t.stats.assignedStudents), icon: 'users', tone: 'default' },
      ];
    }
    const s = this.portalView();
    if (s) {
      return [
        { label: 'dashboard.stats.attendanceRate', value: this.format.percent(s.stats.attendanceRate), icon: 'check-circle', tone: 'success' },
        { label: 'dashboard.stats.attendanceTotal', value: this.format.number(s.stats.attendanceTotal), icon: 'activity', tone: 'info' },
        { label: 'dashboard.stats.outstanding', value: this.format.money(s.stats.outstanding), icon: 'wallet', tone: 'warning', hint: this.tr('dashboard.hints.balance') },
        { label: 'dashboard.stats.unread', value: this.format.number(s.stats.unread), icon: 'bell', tone: 'accent' },
      ];
    }
    return [];
  });

  protected readonly enrollmentChart = computed<EChartsCoreOption | null>(() => {
    const value = this.director();
    if (!value) return null;
    this.language.current();
    return {
      ...this.chartBase(value.enrollmentTrend.map((row) => this.format.monthLabel(row.month))),
      series: [
        {
          name: this.transloco.translate('dashboard.chart.enrollments'),
          type: 'bar',
          data: value.enrollmentTrend.map((row) => row.count),
          barMaxWidth: 26,
          itemStyle: { color: BRASS, borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  });

  protected readonly financeChart = computed<EChartsCoreOption | null>(() => {
    const value = this.director();
    if (!value) return null;
    this.language.current();
    const monthly = value.finance.monthly;
    return {
      ...this.chartBase(monthly.map((row) => this.format.monthLabel(row.month))),
      legend: { top: 0, itemWidth: 10, itemHeight: 10, icon: 'roundRect', textStyle: { color: SLATE } },
      grid: { left: 6, right: 10, top: 34, bottom: 4, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
      series: [
        { name: this.transloco.translate('dashboard.chart.billed'), type: 'bar', data: monthly.map((row) => row.billed), barMaxWidth: 18, itemStyle: { color: SLATE, borderRadius: [3, 3, 0, 0] } },
        { name: this.transloco.translate('dashboard.chart.collected'), type: 'bar', data: monthly.map((row) => row.collected), barMaxWidth: 18, itemStyle: { color: GREEN, borderRadius: [3, 3, 0, 0] } },
      ],
    };
  });

  constructor() {
    void this.load();
  }

  protected tr(key: string, params?: Record<string, unknown>): string {
    return this.transloco.translate(key, params);
  }

  protected lessonStudents(lesson: DashboardLesson): number {
    return lesson._count?.students ?? lesson.students?.length ?? 0;
  }

  protected isUnmarked(lesson: DashboardLesson): boolean {
    return lesson.status === 'SCHEDULED' && new Date(lesson.startsAt).getTime() < this.now;
  }

  protected rateTone(rate: number): 'danger' | 'warning' | 'success' {
    return rate < 60 ? 'danger' : rate < 80 ? 'warning' : 'success';
  }

  protected branchShare(students: number, branches: DirectorDashboard['branchBreakdown']): number {
    const total = branches.reduce((sum, branch) => sum + branch.students, 0);
    return total > 0 ? Math.round((students / total) * 100) : 0;
  }

  protected authorName(item: Announcement): string {
    return item.author ? `${item.author.firstName} ${item.author.lastName}` : this.transloco.translate('common.unknown');
  }

  private chartBase(months: string[]): EChartsCoreOption {
    return {
      backgroundColor: 'transparent',
      textStyle: { color: SLATE },
      tooltip: { trigger: 'axis' },
      grid: { left: 6, right: 10, top: 20, bottom: 4, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
      xAxis: {
        type: 'category',
        data: months,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: GRID } },
        axisLabel: { color: SLATE },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: GRID } },
        axisLabel: { color: SLATE },
      },
    };
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(this.api.get<DashboardData>('/dashboard'));
      this.data.set(response);
    } catch {
      // The global error interceptor surfaces the failure.
    } finally {
      this.loading.set(false);
    }
  }
}
