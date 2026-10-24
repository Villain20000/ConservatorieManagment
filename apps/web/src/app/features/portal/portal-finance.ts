import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FormatService } from '../../core/format.service';
import type { PortalFinance } from '../../core/models';
import { PortalContextService } from '../../core/portal-context.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';
import { PortalChildSelectorComponent } from './portal-child-selector';

@Component({
  selector: 'app-portal-finance',
  imports: [SHARED_IMPORTS, PortalChildSelectorComponent],
  template: `
    <div class="page">
      <app-page-header
        eyebrow="portal.eyebrow"
        title="portal.finance.title"
        subtitle="portal.finance.subtitle"
      />

      <app-portal-child-selector (changed)="reload()" />

      @if (loading()) {
        <div class="grid gap-4 sm:grid-cols-3">
          @for (item of skeletons; track item) {
            <div class="skeleton h-28 rounded-2xl"></div>
          }
        </div>
        <div class="skeleton mt-4 h-64 rounded-2xl"></div>
      } @else if (finance(); as data) {
        <div class="grid gap-4 sm:grid-cols-3">
          <app-stat-card
            label="portal.finance.billed"
            [value]="format.money(data.summary.billed)"
            icon="receipt"
            tone="accent"
          />
          <app-stat-card
            label="portal.finance.collected"
            [value]="format.money(data.summary.collected)"
            icon="wallet"
            tone="success"
          />
          <app-stat-card
            label="portal.finance.outstanding"
            [value]="format.money(data.summary.outstanding)"
            icon="alert"
            [tone]="data.summary.outstanding > 0 ? 'danger' : 'default'"
          />
        </div>

        <div class="mt-4 grid gap-4 xl:grid-cols-5">
          <section class="card overflow-hidden xl:col-span-3">
            <div class="card-head">
              <h2 class="text-[15px] font-semibold">{{ 'portal.finance.charges' | transloco }}</h2>
              <span class="badge badge-neutral">{{ data.charges.length }}</span>
            </div>
            @if (data.charges.length === 0) {
              <app-empty-state title="portal.finance.noCharges" icon="receipt" />
            } @else {
              <div class="table-wrap rounded-none border-0 shadow-none">
                <table class="table">
                  <thead>
                    <tr>
                      <th>{{ 'portal.finance.description' | transloco }}</th>
                      <th>{{ 'portal.finance.period' | transloco }}</th>
                      <th>{{ 'portal.finance.dueDate' | transloco }}</th>
                      <th>{{ 'portal.finance.amount' | transloco }}</th>
                      <th>{{ 'portal.finance.status' | transloco }}</th>
                      <th>{{ 'portal.finance.balance' | transloco }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (charge of data.charges; track charge.id) {
                      <tr>
                        <td class="font-medium text-ink">{{ charge.description }}</td>
                        <td>{{ periodLabel(charge.period) }}</td>
                        <td class="whitespace-nowrap tabular-nums">{{ format.date(charge.dueDate) }}</td>
                        <td class="whitespace-nowrap tabular-nums">{{ format.money(charge.amount) }}</td>
                        <td><app-status-badge [status]="charge.status" /></td>
                        <td
                          class="whitespace-nowrap font-semibold tabular-nums"
                          [class.text-danger]="charge.balance > 0"
                        >
                          {{ format.money(charge.balance) }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>

          <section class="card overflow-hidden xl:col-span-2">
            <div class="card-head">
              <h2 class="text-[15px] font-semibold">{{ 'portal.finance.payments' | transloco }}</h2>
              <span class="badge badge-neutral">{{ data.payments.length }}</span>
            </div>
            @if (data.payments.length === 0) {
              <app-empty-state title="portal.finance.noPayments" icon="wallet" />
            } @else {
              <ul class="divide-y divide-line">
                @for (payment of data.payments; track payment.id) {
                  <li class="flex items-center gap-3 px-5 py-3.5">
                    <span class="icon-box h-9 w-9 shrink-0">
                      <app-icon name="wallet" [size]="15" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="text-[13px] font-semibold tabular-nums">{{ format.money(payment.amount) }}</p>
                      <p class="mt-0.5 text-[11.5px] text-ink-3">
                        {{ ('paymentMethod.' + payment.method) | transloco }}
                        <span class="text-line-strong">·</span>
                        {{ format.date(payment.paidAt) }}
                      </p>
                    </div>
                    @if (payment.reference) {
                      <span class="badge badge-neutral">{{ payment.reference }}</span>
                    }
                  </li>
                }
              </ul>
            }
          </section>
        </div>
      } @else {
        <div class="card">
          <app-empty-state title="portal.finance.empty" icon="wallet" />
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalFinancePage {
  private readonly api = inject(ApiService);
  protected readonly portal = inject(PortalContextService);
  readonly format = inject(FormatService);

  readonly finance = signal<PortalFinance | null>(null);
  readonly loading = signal(true);
  readonly skeletons = [1, 2, 3];

  constructor() {
    void this.portal.ensureLoaded().then(() => this.load());
  }

  reload(): void {
    void this.load();
  }

  periodLabel(period: string | null): string {
    if (!period) return '—';
    if (/^\d{4}-\d{2}$/.test(period)) {
      return `${this.format.monthLabel(period)} ${period.slice(0, 4)}`;
    }
    return period;
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const finance = await firstValueFrom(
        this.api.get<PortalFinance>('/portal/finance', this.portal.childParam()),
      );
      this.finance.set(finance);
    } catch {
      this.finance.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
