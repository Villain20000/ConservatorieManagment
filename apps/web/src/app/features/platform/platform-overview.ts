import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FormatService } from '../../core/format.service';
import type { BillingMetrics, PlatformOverview, PlatformTenant, SubscriptionInvoice } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

type SubscriptionRow = PlatformOverview['subscriptions'][number];

@Component({
  selector: 'app-platform-overview',
  imports: [SHARED_IMPORTS],
  template: `
    <div class="page">
      <app-page-header title="platform.title" subtitle="platform.subtitle" eyebrow="nav.platform">
        <a href="#tenants" class="btn btn-secondary">
          <app-icon name="building" [size]="15" />
          {{ 'platform.tenants' | transloco }}
        </a>
      </app-page-header>

      @if (loading()) {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          @for (item of skeletons; track item) {
            <div class="skeleton h-28 rounded-2xl"></div>
          }
        </div>
        <div class="skeleton mt-5 h-80 rounded-2xl"></div>
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
      } @else {
        @if (overview(); as data) {
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <app-stat-card
              label="platform.stats.tenants"
              [value]="format.number(data.totals.tenants)"
              icon="building"
              tone="accent"
            />
            <app-stat-card
              label="platform.stats.activeTenants"
              [value]="format.number(data.totals.activeTenants)"
              icon="activity"
              tone="success"
            />
            <app-stat-card
              label="platform.stats.trialTenants"
              [value]="format.number(data.totals.trialTenants)"
              icon="clock"
              tone="info"
            />
            <app-stat-card
              label="platform.stats.students"
              [value]="format.number(data.totals.students)"
              icon="users"
            />
            <app-stat-card
              label="platform.stats.teachers"
              [value]="format.number(data.totals.teachers)"
              icon="graduation"
            />
            <app-stat-card
              label="platform.stats.users"
              [value]="format.number(data.totals.users)"
              icon="user"
            />
            <app-stat-card
              label="platform.stats.mrr"
              [value]="format.money(data.totals.mrr)"
              icon="wallet"
              tone="success"
            />
          </div>

          <section class="card mt-5 overflow-hidden">
            <div class="card-head">
              <div>
                <h2 class="text-[15px] font-semibold">{{ 'platform.subscriptions' | transloco }}</h2>
                <p class="mt-0.5 text-[12px] text-ink-3">{{ 'platform.subtitle' | transloco }}</p>
              </div>
              <span class="badge badge-neutral">{{ data.subscriptions.length }}</span>
            </div>

            @if (data.subscriptions.length === 0) {
              <app-empty-state title="platform.empty" message="platform.emptyHint" icon="building" />
            } @else {
              <div class="table-wrap rounded-none border-0 shadow-none">
                <table class="table">
                  <thead>
                    <tr>
                      <th>{{ 'platform.tenantTable.tenant' | transloco }}</th>
                      <th>{{ 'platform.tenantTable.status' | transloco }}</th>
                      <th>{{ 'platform.tenantTable.plan' | transloco }}</th>
                      <th>{{ 'portal.finance.amount' | transloco }}</th>
                      <th>{{ 'platform.tenantTable.seats' | transloco }}</th>
                      <th>{{ 'platform.tenantTable.trialEnds' | transloco }}</th>
                      <th>{{ 'platform.tenantTable.mrr' | transloco }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (subscription of data.subscriptions; track subscription.tenantId) {
                      <tr>
                        <td>
                          <a
                            class="link"
                            [routerLink]="['/platform/tenants', subscription.tenantId]"
                          >
                            {{ subscription.tenantName }}
                          </a>
                        </td>
                        <td>
                          <app-status-badge
                            [status]="subscription.status"
                            [label]="statusLabel(subscription.status)"
                          />
                        </td>
                        <td class="whitespace-nowrap">{{ subscription.plan }}</td>
                        <td class="whitespace-nowrap tabular-nums">{{ format.money(subscription.priceMonthly) }}</td>
                        <td class="tabular-nums">{{ format.number(subscription.seatsUsed) }}</td>
                        <td class="whitespace-nowrap">
                          @if (subscription.trialEndsAt) {
                            <span class="block text-[10px] uppercase tracking-wide text-ink-3">
                              {{ 'platform.tenantTable.trialEnds' | transloco }}
                            </span>
                            {{ format.date(subscription.trialEndsAt) }}
                          } @else if (subscription.currentPeriodEnd) {
                            <span class="block text-[10px] uppercase tracking-wide text-ink-3">
                              {{ 'platform.tenantTable.periodEnd' | transloco }}
                            </span>
                            {{ format.date(subscription.currentPeriodEnd) }}
                          } @else {
                            —
                          }
                        </td>
                        <td class="whitespace-nowrap font-medium tabular-nums text-ink">
                          {{ subscriptionMrr(subscription) }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
        }

        <!-- SaaS Commercial Billing Engine Section -->
        <section id="billing" class="card mt-8 overflow-hidden">
          <div class="card-head flex-wrap gap-4">
            <div>
              <h2 class="flex items-center gap-2 text-[16px] font-semibold tracking-tight text-ink">
                <app-icon name="wallet" [size]="18" class="text-accent" />
                {{ 'platform.billing.title' | transloco }}
              </h2>
              <p class="mt-0.5 text-[12px] text-ink-3">
                {{ 'platform.billing.subtitle' | transloco }}
              </p>
            </div>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              [disabled]="runningCycle()"
              (click)="runBillingCycle()"
            >
              <app-icon name="refresh" [size]="14" [class.animate-spin]="runningCycle()" />
              {{ (runningCycle() ? 'platform.billing.runningCycle' : 'platform.billing.runCycle') | transloco }}
            </button>
          </div>

          @if (billingMetrics(); as metrics) {
            <div class="grid grid-cols-2 gap-3 border-b border-line bg-surface-2 p-4 sm:grid-cols-3 xl:grid-cols-6">
              <div>
                <span class="text-[11px] font-medium text-ink-3">{{ 'platform.billing.mrr' | transloco }}</span>
                <p class="text-[16px] font-semibold tabular-nums text-accent-strong">{{ format.money(metrics.mrr) }}</p>
              </div>
              <div>
                <span class="text-[11px] font-medium text-ink-3">{{ 'platform.billing.arr' | transloco }}</span>
                <p class="text-[16px] font-semibold tabular-nums text-ink">{{ format.money(metrics.arr) }}</p>
              </div>
              <div>
                <span class="text-[11px] font-medium text-ink-3">{{ 'platform.billing.totalInvoiced' | transloco }}</span>
                <p class="text-[16px] font-semibold tabular-nums text-ink">{{ format.money(metrics.totalInvoiced) }}</p>
              </div>
              <div>
                <span class="text-[11px] font-medium text-ink-3">{{ 'platform.billing.totalCollected' | transloco }}</span>
                <p class="text-[16px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{{ format.money(metrics.totalCollected) }}</p>
              </div>
              <div>
                <span class="text-[11px] font-medium text-ink-3">{{ 'platform.billing.totalOverdue' | transloco }}</span>
                <p class="text-[16px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">{{ format.money(metrics.totalOverdue) }}</p>
              </div>
              <div>
                <span class="text-[11px] font-medium text-ink-3">{{ 'platform.billing.dunningActive' | transloco }}</span>
                <p class="text-[16px] font-semibold tabular-nums" [class.text-rose-600]="metrics.pastDueSubscriptionsCount > 0">{{ metrics.pastDueSubscriptionsCount }}</p>
              </div>
            </div>
          }

          @if (subscriptionInvoices().length === 0) {
            <div class="p-6">
              <app-empty-state
                title="platform.billing.emptyInvoices"
                message="platform.billing.subtitle"
                icon="receipt"
              />
            </div>
          } @else {
            <div class="table-wrap rounded-none border-0 shadow-none">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ 'platform.billing.invoiceNumber' | transloco }}</th>
                    <th>{{ 'platform.billing.tenant' | transloco }}</th>
                    <th>{{ 'platform.billing.plan' | transloco }}</th>
                    <th>{{ 'platform.billing.period' | transloco }}</th>
                    <th>{{ 'platform.billing.amount' | transloco }}</th>
                    <th>{{ 'platform.billing.status' | transloco }}</th>
                    <th>{{ 'platform.billing.dueAt' | transloco }}</th>
                    <th>{{ 'platform.billing.actions' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (inv of subscriptionInvoices(); track inv.id) {
                    <tr>
                      <td class="font-mono text-[12px] font-semibold text-accent-strong">
                        {{ inv.number }}
                      </td>
                      <td class="font-medium text-ink">
                        {{ inv.subscription?.tenant?.name || '—' }}
                      </td>
                      <td>{{ inv.subscription?.plan?.name || '—' }}</td>
                      <td class="whitespace-nowrap text-[12px]">
                        {{ format.date(inv.periodStart) }} – {{ format.date(inv.periodEnd) }}
                      </td>
                      <td class="tabular-nums font-semibold">{{ format.money(inv.total) }}</td>
                      <td>
                        <span
                          class="badge"
                          [class]="inv.status === 'PAID' ? 'badge-success' : inv.status === 'OPEN' ? 'badge-warning' : 'badge-neutral'"
                        >
                          {{ inv.status }}
                        </span>
                      </td>
                      <td class="whitespace-nowrap text-[12px]">
                        {{ inv.dueAt ? format.date(inv.dueAt) : '—' }}
                      </td>
                      <td>
                        @if (inv.status === 'OPEN') {
                          <div class="flex items-center gap-1">
                            <button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              (click)="payInvoice(inv)"
                            >
                              <app-icon name="wallet" [size]="13" />
                              {{ 'platform.billing.pay' | transloco }}
                            </button>
                            <button
                              type="button"
                              class="btn-ghost btn-icon-sm text-danger hover:bg-danger-soft"
                              (click)="simulateFailure(inv)"
                              [title]="'platform.billing.simulateFailure' | transloco"
                            >
                              <app-icon name="alert" [size]="14" />
                            </button>
                          </div>
                        } @else if (inv.paidAt) {
                          <span class="text-[11.5px] text-ink-3">
                            {{ 'platform.billing.paidAt' | transloco }}: {{ format.date(inv.paidAt) }}
                          </span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <section id="tenants" class="mt-8 scroll-mt-6">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h2 class="text-[17px] font-semibold tracking-tight">{{ 'platform.tenants' | transloco }}</h2>
            <span class="text-[11.5px] text-ink-3">{{ tenants().length }}</span>
          </div>

          @if (tenants().length === 0) {
            <div class="card">
              <app-empty-state title="platform.empty" message="platform.emptyHint" icon="building" />
            </div>
          } @else {
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              @for (tenant of tenants(); track tenant.id) {
                <a
                  class="card group block p-5 transition-all duration-150 hover:border-line-strong hover:shadow-pop"
                  [routerLink]="['/platform/tenants', tenant.id]"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate text-[15px] font-semibold tracking-tight text-ink">{{ tenant.name }}</p>
                      <p class="mt-0.5 truncate font-mono text-[11px] text-ink-3">{{ tenant.slug }}</p>
                    </div>
                    <app-status-badge [status]="tenant.status" [label]="statusLabel(tenant.status)" />
                  </div>

                  <div class="mt-3 flex items-center gap-2">
                    <span class="badge badge-accent">
                      <app-icon name="layers" [size]="12" />
                      {{ tenant.plan?.name ?? ('platform.noPlan' | transloco) }}
                    </span>
                    @if (tenant.plan) {
                      <span class="text-[11.5px] tabular-nums text-ink-3">
                        {{ format.money(tenant.plan.priceMonthly) }}
                      </span>
                    }
                  </div>

                  <div class="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-line bg-surface-2 p-3 text-center">
                    <div>
                      <p class="text-[15px] font-semibold tabular-nums">{{ format.number(tenant.usage.students) }}</p>
                      <p class="text-[10px] uppercase tracking-wide text-ink-3">{{ 'platform.usage.students' | transloco }}</p>
                    </div>
                    <div>
                      <p class="text-[15px] font-semibold tabular-nums">{{ format.number(tenant.usage.teachers) }}</p>
                      <p class="text-[10px] uppercase tracking-wide text-ink-3">{{ 'platform.usage.teachers' | transloco }}</p>
                    </div>
                    <div>
                      <p class="text-[15px] font-semibold tabular-nums">{{ format.number(tenant.usage.branches) }}</p>
                      <p class="text-[10px] uppercase tracking-wide text-ink-3">{{ 'platform.usage.branches' | transloco }}</p>
                    </div>
                  </div>

                  <div class="mt-4 space-y-2.5">
                    <div>
                      <div class="mb-1 flex items-center justify-between gap-2 text-[11px] text-ink-3">
                        <span>{{ 'platform.usage.students' | transloco }}</span>
                        <span class="tabular-nums">
                          {{ 'platform.usage.utilization' | transloco: { value: format.number(tenant.usage.studentUtilization) } }}
                        </span>
                      </div>
                      <app-progress [value]="tenant.usage.studentUtilization" [tone]="utilizationTone(tenant.usage.studentUtilization)" />
                    </div>
                    <div>
                      <div class="mb-1 flex items-center justify-between gap-2 text-[11px] text-ink-3">
                        <span>{{ 'platform.usage.teachers' | transloco }}</span>
                        <span class="tabular-nums">
                          {{ 'platform.usage.utilization' | transloco: { value: format.number(tenant.usage.teacherUtilization) } }}
                        </span>
                      </div>
                      <app-progress [value]="tenant.usage.teacherUtilization" [tone]="utilizationTone(tenant.usage.teacherUtilization)" />
                    </div>
                  </div>

                  <div class="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-[11.5px] text-ink-3">
                    <span>{{ format.date(tenant.createdAt) }}</span>
                    <span class="inline-flex items-center gap-1 font-semibold text-accent-strong">
                      {{ 'platform.openTenant' | transloco }}
                      <app-icon name="arrow-up-right" [size]="13" />
                    </span>
                  </div>
                </a>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformOverviewPage {
  private readonly api = inject(ApiService);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  readonly format = inject(FormatService);

  readonly overview = signal<PlatformOverview | null>(null);
  readonly tenants = signal<PlatformTenant[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly skeletons = [1, 2, 3, 4];
  readonly billingMetrics = signal<BillingMetrics | null>(null);
  readonly subscriptionInvoices = signal<SubscriptionInvoice[]>([]);
  readonly runningCycle = signal(false);

  constructor() {
    void this.load();
  }

  retry(): void {
    void this.load();
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

  subscriptionMrr(subscription: SubscriptionRow): string {
    if (!['ACTIVE', 'TRIALING'].includes(subscription.status)) return '—';
    return this.format.money(subscription.priceMonthly);
  }

  utilizationTone(value: number): 'accent' | 'warning' | 'danger' {
    if (value >= 90) return 'danger';
    if (value >= 70) return 'warning';
    return 'accent';
  }

  async loadBilling(): Promise<void> {
    try {
      const [metrics, invoices] = await Promise.all([
        firstValueFrom(this.api.get<BillingMetrics>('/platform/billing/metrics')),
        firstValueFrom(this.api.list<SubscriptionInvoice>('/platform/billing/invoices')),
      ]);
      this.billingMetrics.set(metrics);
      this.subscriptionInvoices.set(invoices.data);
    } catch {
      // Platform billing not active
    }
  }

  async runBillingCycle(): Promise<void> {
    this.runningCycle.set(true);
    try {
      await firstValueFrom(
        this.api.post<{ generatedCount: number }>('/platform/billing/invoices/generate-cycle', {}),
      );
      this.toast.success('platform.billing.cycleSuccess');
      await this.loadBilling();
      await this.load();
    } catch {
      this.toast.error('common.error');
    } finally {
      this.runningCycle.set(false);
    }
  }

  async payInvoice(inv: SubscriptionInvoice): Promise<void> {
    try {
      await firstValueFrom(
        this.api.post(`/platform/billing/invoices/${inv.id}/pay`, { paymentMethod: 'CARD' }),
      );
      this.toast.success('platform.billing.paySuccess');
      await this.loadBilling();
      await this.load();
    } catch {
      this.toast.error('common.error');
    }
  }

  async simulateFailure(inv: SubscriptionInvoice): Promise<void> {
    try {
      await firstValueFrom(
        this.api.post(`/platform/billing/invoices/${inv.id}/simulate-failure`, {
          failureCode: 'INSUFFICIENT_FUNDS',
        }),
      );
      this.toast.info('platform.billing.failureSuccess');
      await this.loadBilling();
      await this.load();
    } catch {
      this.toast.error('common.error');
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const [overview, tenants] = await Promise.all([
        firstValueFrom(this.api.get<PlatformOverview>('/platform/overview')),
        firstValueFrom(this.api.list<PlatformTenant>('/platform/tenants')),
      ]);
      this.overview.set(overview);
      this.tenants.set(tenants.data);
      void this.loadBilling();
    } catch {
      this.overview.set(null);
      this.tenants.set([]);
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
