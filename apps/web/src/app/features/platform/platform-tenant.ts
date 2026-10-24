import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FormatService } from '../../core/format.service';
import type { PlatformTenantDetail } from '../../core/models';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

@Component({
  selector: 'app-platform-tenant',
  imports: [SHARED_IMPORTS],
  template: `
    <div class="page">
      <a routerLink="/platform" class="btn btn-ghost btn-sm -ml-2 mb-3">
        <app-icon name="chevron-left" [size]="15" />
        {{ 'platform.backToPlatform' | transloco }}
      </a>

      @if (loading()) {
        <div class="skeleton mb-6 h-16 w-72 rounded-2xl"></div>
        <div class="grid gap-4 lg:grid-cols-2">
          @for (item of skeletons; track item) {
            <div class="skeleton h-56 rounded-2xl"></div>
          }
        </div>
      } @else if (error()) {
        <div class="card card-pad">
          <div class="alert alert-danger">
            <app-icon name="alert" [size]="18" class="mt-0.5 shrink-0" />
            <div class="flex-1">
              <p class="font-semibold">{{ 'common.error' | transloco }}</p>
              <button type="button" class="btn btn-secondary btn-sm mt-3" (click)="retry()">
                <app-icon name="refresh" [size]="14" />
                {{ 'common.retry' | transloco }}
              </button>
            </div>
          </div>
        </div>
      } @else if (tenant(); as detail) {
        <header class="flex flex-wrap items-end justify-between gap-4 pb-6">
          <div class="min-w-0">
            <p class="eyebrow">{{ 'platform.tenants' | transloco }}</p>
            <div class="mt-1 flex flex-wrap items-center gap-2.5">
              <h1 class="text-[26px] font-semibold leading-tight tracking-[-0.025em] sm:text-[30px]">
                {{ detail.name }}
              </h1>
              <app-status-badge [status]="detail.status" [label]="statusLabel(detail.status)" />
            </div>
            <p class="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              <span class="font-mono text-[12px] text-ink-3">{{ detail.slug }}</span>
              <span class="text-line-strong">·</span>
              <span>{{ detail.plan?.name ?? ('platform.noPlan' | transloco) }}</span>
              @if (detail.plan) {
                <span class="text-line-strong">·</span>
                <span class="tabular-nums">{{ format.money(detail.plan.priceMonthly) }}</span>
              }
            </p>
          </div>
        </header>

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="card">
            <div class="card-head">
              <h2 class="text-[15px] font-semibold">{{ 'platform.tenant.contact' | transloco }}</h2>
              <span class="icon-box h-8 w-8"><app-icon name="mail" [size]="14" /></span>
            </div>
            <div class="card-pad">
              <dl class="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
                <div class="bg-surface p-3.5">
                  <dt class="field-label">{{ 'platform.tenant.legalName' | transloco }}</dt>
                  <dd class="mt-1 text-[13px] font-medium">{{ detail.legalName || ('common.noneFound' | transloco) }}</dd>
                </div>
                <div class="bg-surface p-3.5">
                  <dt class="field-label">{{ 'platform.tenant.taxId' | transloco }}</dt>
                  <dd class="mt-1 text-[13px] font-medium tabular-nums">{{ detail.taxId || ('common.noneFound' | transloco) }}</dd>
                </div>
                <div class="bg-surface p-3.5">
                  <dt class="field-label">{{ 'common.email' | transloco }}</dt>
                  <dd class="mt-1 truncate text-[13px] font-medium">{{ detail.email || ('common.noneFound' | transloco) }}</dd>
                </div>
                <div class="bg-surface p-3.5">
                  <dt class="field-label">{{ 'common.phone' | transloco }}</dt>
                  <dd class="mt-1 text-[13px] font-medium tabular-nums">{{ detail.phone || ('common.noneFound' | transloco) }}</dd>
                </div>
                <div class="bg-surface p-3.5 sm:col-span-2">
                  <dt class="field-label">{{ 'platform.tenant.createdAt' | transloco }}</dt>
                  <dd class="mt-1 text-[13px] font-medium">{{ format.date(detail.createdAt, 'long') }}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section class="card">
            <div class="card-head">
              <h2 class="text-[15px] font-semibold">{{ 'platform.tenant.plan' | transloco }}</h2>
              <span class="icon-box h-8 w-8"><app-icon name="layers" [size]="14" /></span>
            </div>
            <div class="card-pad">
              @if (detail.plan; as plan) {
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-[16px] font-semibold">{{ plan.name }}</p>
                    <p class="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-ink-3">{{ plan.code }}</p>
                  </div>
                  <app-status-badge [status]="plan.status" [label]="statusLabel(plan.status)" />
                </div>

                <dl class="mt-4 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
                  <div class="bg-surface p-3.5">
                    <dt class="field-label">{{ 'portal.finance.amount' | transloco }}</dt>
                    <dd class="mt-1 text-[13px] font-semibold tabular-nums">{{ format.money(plan.priceMonthly) }}</dd>
                  </div>
                  <div class="bg-surface p-3.5">
                    <dt class="field-label">{{ 'platform.tenantTable.seats' | transloco }}</dt>
                    <dd class="mt-1 text-[13px] font-semibold tabular-nums">{{ format.number(plan.seatsUsed) }}</dd>
                  </div>
                  <div class="bg-surface p-3.5">
                    <dt class="field-label">{{ 'platform.tenantTable.trialEnds' | transloco }}</dt>
                    <dd class="mt-1 text-[13px] font-medium">{{ format.date(plan.trialEndsAt) }}</dd>
                  </div>
                  <div class="bg-surface p-3.5">
                    <dt class="field-label">{{ 'platform.tenantTable.periodEnd' | transloco }}</dt>
                    <dd class="mt-1 text-[13px] font-medium">{{ format.date(plan.currentPeriodEnd) }}</dd>
                  </div>
                </dl>
              } @else {
                <div class="py-6 text-center">
                  <p class="text-[13px] font-medium text-ink-2">{{ 'platform.noPlan' | transloco }}</p>
                </div>
              }
            </div>
          </section>

          <section class="card">
            <div class="card-head">
              <h2 class="text-[15px] font-semibold">{{ 'platform.tenant.usage' | transloco }}</h2>
              <span class="icon-box h-8 w-8"><app-icon name="activity" [size]="14" /></span>
            </div>
            <div class="card-pad space-y-5">
              <div>
                <div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p class="field-label">{{ 'platform.usage.students' | transloco }}</p>
                  <p class="text-[11.5px] text-ink-3">
                    {{ 'settings.tenant.studentsUsage' | transloco: { used: format.number(detail.usage.students), max: format.number(detail.usage.maxStudents) } }}
                  </p>
                </div>
                <app-progress [value]="detail.usage.studentUtilization" [tone]="utilizationTone(detail.usage.studentUtilization)" />
                <p class="mt-1.5 text-[11px] text-ink-3">
                  {{ 'platform.usage.utilization' | transloco: { value: format.number(detail.usage.studentUtilization) } }}
                </p>
              </div>
              <div>
                <div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p class="field-label">{{ 'platform.usage.teachers' | transloco }}</p>
                  <p class="text-[11.5px] text-ink-3">
                    {{ 'settings.tenant.teachersUsage' | transloco: { used: format.number(detail.usage.teachers), max: format.number(detail.usage.maxTeachers) } }}
                  </p>
                </div>
                <app-progress [value]="detail.usage.teacherUtilization" [tone]="utilizationTone(detail.usage.teacherUtilization)" />
                <p class="mt-1.5 text-[11px] text-ink-3">
                  {{ 'platform.usage.utilization' | transloco: { value: format.number(detail.usage.teacherUtilization) } }}
                </p>
              </div>
              <div class="grid grid-cols-3 gap-2 rounded-xl border border-line bg-surface-2 p-3 text-center">
                <div>
                  <p class="text-[15px] font-semibold tabular-nums">{{ format.number(detail.usage.members) }}</p>
                  <p class="text-[10px] uppercase tracking-wide text-ink-3">{{ 'platform.usage.members' | transloco }}</p>
                </div>
                <div>
                  <p class="text-[15px] font-semibold tabular-nums">{{ format.number(detail.usage.branches) }}</p>
                  <p class="text-[10px] uppercase tracking-wide text-ink-3">{{ 'platform.usage.branches' | transloco }}</p>
                </div>
                <div>
                  <p class="text-[15px] font-semibold tabular-nums">{{ format.number(detail.usage.lessons) }}</p>
                  <p class="text-[10px] uppercase tracking-wide text-ink-3">{{ 'platform.usage.lessons' | transloco }}</p>
                </div>
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-head">
              <h2 class="text-[15px] font-semibold">{{ 'platform.tenant.branches' | transloco }}</h2>
              <span class="badge badge-neutral">{{ detail.branches?.length ?? 0 }}</span>
            </div>
            <div class="card-pad">
              @if ((detail.branches?.length ?? 0) === 0) {
                <p class="py-4 text-center text-[13px] text-ink-3">{{ 'common.noResults' | transloco }}</p>
              } @else {
                <ul class="divide-y divide-line">
                  @for (branch of detail.branches ?? []; track branch.id) {
                    <li class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span class="icon-box h-8 w-8 shrink-0"><app-icon name="building" [size]="14" /></span>
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-[13px] font-semibold">{{ branch.name }}</p>
                        <p class="text-[11.5px] text-ink-3">
                          {{ branch.code }}@if (branch.city) { · {{ branch.city }} }
                        </p>
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>
          </section>

          <section class="card lg:col-span-2">
            <div class="card-head">
              <h2 class="text-[15px] font-semibold">{{ 'platform.tenant.members' | transloco }}</h2>
              <span class="badge badge-neutral">{{ detail.members?.length ?? 0 }}</span>
            </div>
            @if ((detail.members?.length ?? 0) === 0) {
              <app-empty-state title="platform.tenant.noMembers" icon="users" />
            } @else {
              <ul class="divide-y divide-line">
                @for (member of detail.members ?? []; track member.id) {
                  <li class="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6">
                    <app-avatar
                      [firstName]="member.user.firstName"
                      [lastName]="member.user.lastName"
                      [size]="34"
                    />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-[13px] font-semibold">
                        {{ member.user.firstName }} {{ member.user.lastName }}
                      </p>
                      <p class="truncate text-[11.5px] text-ink-3">{{ member.user.email }}</p>
                    </div>
                    <span class="badge badge-neutral">{{ ('roles.' + member.role) | transloco }}</span>
                  </li>
                }
              </ul>
            }
          </section>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformTenantPage {
  private readonly api = inject(ApiService);
  private readonly transloco = inject(TranslocoService);
  readonly format = inject(FormatService);

  readonly id = input.required<string>();
  readonly tenant = signal<PlatformTenantDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly skeletons = [1, 2, 3, 4];

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.load(id);
    });
  }

  retry(): void {
    const id = this.id();
    if (id) void this.load(id);
  }

  statusLabel(status: string): string {
    const platformKey = `platform.status.${status}`;
    const platformLabel = this.transloco.translate(platformKey);
    if (platformLabel !== platformKey) return platformLabel;
    const genericKey = `status.${status}`;
    const genericLabel = this.transloco.translate(genericKey);
    if (genericLabel !== genericKey) return genericLabel;
    return status.replaceAll('_', ' ');
  }

  utilizationTone(value: number): 'accent' | 'warning' | 'danger' {
    if (value >= 90) return 'danger';
    if (value >= 70) return 'warning';
    return 'accent';
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const detail = await firstValueFrom(
        this.api.get<PlatformTenantDetail>(`/platform/tenants/${id}`),
      );
      this.tenant.set(detail);
    } catch {
      this.tenant.set(null);
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
