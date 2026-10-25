import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import type { EChartsCoreOption } from 'echarts/core';
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { saveBlob } from '../../core/download';
import { FormatService } from '../../core/format.service';
import type {
  Charge,
  FinanceOverview,
  Payment,
  Student,
  StudentLedger,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

type FinanceTab = 'overview' | 'payments';

@Component({
  selector: 'app-finance-page',
  imports: [SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="finance.title" subtitle="finance.subtitle">
        @if (canWrite()) {
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" (click)="openCharge()">
              <app-icon name="plus" [size]="15" />
              {{ 'finance.actions.newCharge' | transloco }}
            </button>
            <button type="button" class="btn btn-primary" (click)="openPayment()">
              <app-icon name="wallet" [size]="15" />
              {{ 'finance.actions.recordPayment' | transloco }}
            </button>
          </div>
        }
      </app-page-header>

      <div class="mb-5 inline-flex rounded-xl border border-line bg-surface p-1 shadow-card">
        @for (item of tabs; track item.value) {
          <button
            type="button"
            class="rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors"
            [class]="
              tab() === item.value
                ? 'bg-accent-soft text-accent-strong'
                : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
            "
            (click)="setTab(item.value)"
          >
            {{ item.key | transloco }}
          </button>
        }
      </div>

      @if (tab() === 'overview') {
        @if (loadingOverview()) {
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            @for (row of [1, 2, 3, 4, 5, 6]; track row) {
              <div class="card p-5">
                <div class="skeleton h-3 w-20"></div>
                <div class="skeleton mt-3 h-7 w-24"></div>
              </div>
            }
          </div>
          <div class="card mt-4 p-5">
            <div class="skeleton h-4 w-32"></div>
            <div class="skeleton mt-4 h-[260px] w-full"></div>
          </div>
        } @else if (overview(); as data) {
          <div class="stagger grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <app-stat-card
              label="finance.totals.billed"
              [value]="format.money(data.totals.billed)"
              icon="receipt"
              tone="accent"
            />
            <app-stat-card
              label="finance.totals.collected"
              [value]="format.money(data.totals.collected)"
              icon="wallet"
              tone="success"
            />
            <app-stat-card
              label="finance.totals.outstanding"
              [value]="format.money(data.totals.outstanding)"
              icon="credit-card"
              tone="warning"
            />
            <app-stat-card
              label="finance.totals.overdue"
              [value]="format.money(data.totals.overdue)"
              icon="alert"
              tone="danger"
            />
            <app-stat-card
              label="finance.totals.collectionRate"
              [value]="format.percent(data.totals.collectionRate)"
              icon="percent"
              tone="info"
            />
            <app-stat-card
              label="finance.totals.studentsWithBalance"
              [value]="format.number(data.totals.studentsWithBalance)"
              icon="users"
            />
          </div>

          <div class="card mt-4 p-5">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-sm font-semibold text-ink">
                {{ 'finance.monthly' | transloco }}
              </h2>
            </div>
            @if (chartOptions(); as options) {
              <app-chart [options]="options" [height]="280" />
            } @else {
              <app-empty-state
                title="finance.monthly"
                message="common.noResults"
                icon="activity"
              />
            }
          </div>

          <div class="mt-4 grid gap-4 xl:grid-cols-2">
            <section class="card overflow-hidden">
              <div class="card-head">
                <h2 class="text-sm font-semibold text-ink">
                  {{ 'finance.topDebtors' | transloco }}
                </h2>
                <app-icon name="trending-up" [size]="16" />
              </div>
              @if (debtors().length === 0) {
                <app-empty-state
                  title="finance.emptyDebtors"
                  icon="wallet"
                />
              } @else {
                <ul class="divide-y divide-line">
                  @for (debtor of debtors(); track debtor.studentId) {
                    <li class="flex items-center gap-3 px-5 py-3.5">
                      <app-avatar
                        [firstName]="debtor.student.firstName"
                        [lastName]="debtor.student.lastName"
                        [size]="36"
                      />
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-[13.5px] font-semibold text-ink">
                          {{ debtor.student.firstName }} {{ debtor.student.lastName }}
                        </p>
                        <p class="text-[11.5px] text-ink-3">
                          {{ debtor.student.registrationNumber }}
                        </p>
                      </div>
                      <span class="text-[13px] font-semibold tabular-nums text-danger">
                        {{ format.money(debtor.balance) }}
                      </span>
                      <button
                        type="button"
                        class="btn-secondary btn-sm"
                        (click)="openLedger(debtor.studentId)"
                      >
                        {{ 'finance.viewLedger' | transloco }}
                      </button>
                    </li>
                  }
                </ul>
              }
            </section>

            <section class="card overflow-hidden">
              <div class="card-head">
                <h2 class="text-sm font-semibold text-ink">
                  {{ 'finance.recentPayments' | transloco }}
                </h2>
                <app-icon name="receipt" [size]="16" />
              </div>
              @if (data.recentPayments.length === 0) {
                <app-empty-state
                  title="finance.emptyPayments"
                  icon="receipt"
                />
              } @else {
                <ul class="divide-y divide-line">
                  @for (payment of data.recentPayments; track payment.id) {
                    <li class="flex items-center gap-3 px-5 py-3.5">
                      @if (payment.student; as student) {
                        <app-avatar
                          [firstName]="student.firstName"
                          [lastName]="student.lastName"
                          [size]="36"
                        />
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-[13.5px] font-semibold text-ink">
                            {{ student.firstName }} {{ student.lastName }}
                          </p>
                          <p class="truncate text-[11.5px] text-ink-3">
                            {{ payment.charge?.description ?? '—' }}
                          </p>
                        </div>
                      } @else {
                        <div class="min-w-0 flex-1 text-[13px] text-ink-3">
                          {{ 'common.unknown' | transloco }}
                        </div>
                      }
                      <div class="text-right">
                        <p class="text-[13px] font-semibold tabular-nums text-success">
                          {{ format.money(payment.amount) }}
                        </p>
                        <p class="text-[11px] text-ink-3">
                          {{ ('paymentMethod.' + payment.method) | transloco }} ·
                          {{ format.date(payment.paidAt) }}
                        </p>
                      </div>
                      <button
                        type="button"
                        class="btn-ghost btn-icon-sm"
                        [disabled]="!payment.student"
                        (click)="openLedger(payment.student?.id)"
                        [attr.aria-label]="'finance.viewLedger' | transloco"
                      >
                        <app-icon name="arrow-right" [size]="15" />
                      </button>
                      <button
                        type="button"
                        class="btn-ghost btn-icon-sm"
                        (click)="downloadReceipt(payment)"
                        [attr.aria-label]="'finance.downloadReceipt' | transloco"
                      >
                        <app-icon name="download" [size]="15" />
                      </button>
                    </li>
                  }
                </ul>
              }
            </section>
          </div>
        } @else {
          <div class="card">
            <app-empty-state
              title="common.noResults"
              icon="wallet"
            />
          </div>
        }
      } @else {
        <section class="card overflow-hidden">
          <div class="card-head">
            <div class="relative w-full max-w-sm">
              <app-icon
                name="search"
                [size]="15"
                class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
              />
              <input name="search"
                type="search"
                class="input pl-9"
                [formControl]="searchControl"
                [attr.placeholder]="'finance.searchStudent' | transloco"
                [attr.aria-label]="'finance.searchStudent' | transloco" autocomplete="off" />
            </div>
            <span class="badge badge-neutral tabular-nums">
              {{ format.number(paymentsTotal()) }}
            </span>
          </div>

          @if (loadingPayments()) {
            <div class="space-y-3 p-5">
              @for (row of [1, 2, 3, 4, 5]; track row) {
                <div class="flex items-center gap-4">
                  <div class="skeleton h-8 w-8 rounded-full"></div>
                  <div class="skeleton h-4 flex-1"></div>
                  <div class="skeleton h-4 w-24"></div>
                  <div class="skeleton h-4 w-20"></div>
                </div>
              }
            </div>
          } @else if (payments().length === 0) {
            <app-empty-state title="finance.emptyPayments" icon="receipt" />
          } @else {
            <div class="table-wrap rounded-none border-0 shadow-none">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ 'finance.table.student' | transloco }}</th>
                    <th>{{ 'finance.table.amount' | transloco }}</th>
                    <th>{{ 'finance.table.method' | transloco }}</th>
                    <th>{{ 'finance.table.date' | transloco }}</th>
                    <th>{{ 'finance.table.receipt' | transloco }}</th>
                    <th>{{ 'finance.table.reference' | transloco }}</th>
                    <th>{{ 'finance.table.charge' | transloco }}</th>
                    <th>{{ 'common.status' | transloco }}</th>
                    <th class="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (payment of payments(); track payment.id) {
                    <tr class="row-link" (click)="openLedger(payment.student?.id)">
                      <td>
                        @if (payment.student; as student) {
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
                        } @else {
                          <span class="text-ink-3">{{ 'common.unknown' | transloco }}</span>
                        }
                      </td>
                      <td class="font-semibold tabular-nums text-ink">
                        {{ format.money(payment.amount) }}
                      </td>
                      <td>{{ ('paymentMethod.' + payment.method) | transloco }}</td>
                      <td class="whitespace-nowrap">{{ format.date(payment.paidAt) }}</td>
                      <td class="whitespace-nowrap font-mono text-[12px]">
                        {{ payment.receiptNumber }}
                      </td>
                      <td class="text-[12px]">
                        {{ payment.reference || ('common.noneFound' | transloco) }}
                      </td>
                      <td class="max-w-[220px] truncate">
                        {{ payment.charge?.description ?? '—' }}
                      </td>
                      <td><app-status-badge [status]="payment.status" /></td>
                      <td>
                        <button
                          type="button"
                          class="btn-ghost btn-icon-sm"
                          (click)="downloadReceipt(payment); $event.stopPropagation()"
                          [attr.aria-label]="'finance.downloadReceipt' | transloco"
                        >
                          <app-icon name="download" [size]="15" />
                        </button>@if (canApprove() && payment.status === 'POSTED') {<button type="button" class="btn-ghost btn-icon-sm" (click)="openVoid(payment); $event.stopPropagation()" [attr.aria-label]="'finance.actions.voidPayment' | transloco" [title]="'finance.actions.voidPayment' | transloco"><app-icon name="x" [size]="15" /></button>}
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
                [total]="paymentsTotal()"
                (pageChange)="goPage($event)"
              />
            </div>
          }
        </section>
      }
    </div>

    <app-drawer
      [open]="ledgerOpen()"
      [title]="ledgerTitle()"
      [translateTitle]="false"
      size="lg"
      [showFooter]="true"
      (closed)="closeLedger()"
    >
      @if (ledgerLoading()) {
        <div class="space-y-4">
          <div class="skeleton h-10 w-48"></div>
          <div class="grid grid-cols-3 gap-2">
            @for (row of [1, 2, 3]; track row) {
              <div class="skeleton h-20 w-full"></div>
            }
          </div>
          <div class="skeleton h-40 w-full"></div>
        </div>
      } @else if (ledger(); as data) {
        <div class="flex items-center gap-3">
          <app-avatar
            [firstName]="data.student.firstName"
            [lastName]="data.student.lastName"
            [size]="44"
          />
          <div class="min-w-0">
            <p class="truncate text-[15px] font-semibold text-ink">
              {{ data.student.firstName }} {{ data.student.lastName }}
            </p>
            <p class="text-[12px] text-ink-3">{{ data.student.registrationNumber }}</p>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-3 gap-2">
          <div class="rounded-xl border border-line bg-surface-2 p-3">
            <p class="text-[10.5px] font-medium uppercase tracking-wide text-ink-3">
              {{ 'finance.ledger.billed' | transloco }}
            </p>
            <p class="mt-1 text-[15px] font-semibold tabular-nums text-ink">
              {{ format.money(data.summary.billed) }}
            </p>
          </div>
          <div class="rounded-xl border border-line bg-surface-2 p-3">
            <p class="text-[10.5px] font-medium uppercase tracking-wide text-ink-3">
              {{ 'finance.ledger.collected' | transloco }}
            </p>
            <p class="mt-1 text-[15px] font-semibold tabular-nums text-success">
              {{ format.money(data.summary.collected) }}
            </p>
          </div>
          <div class="rounded-xl border border-line bg-surface-2 p-3">
            <p class="text-[10.5px] font-medium uppercase tracking-wide text-ink-3">
              {{ 'finance.ledger.outstanding' | transloco }}
            </p>
            <p class="mt-1 text-[15px] font-semibold tabular-nums text-danger">
              {{ format.money(data.summary.outstanding) }}
            </p>
          </div>
        </div>

        <div class="mt-6">
          <h3 class="text-sm font-semibold text-ink">
            {{ 'finance.ledger.charges' | transloco }}
          </h3>
          @if (data.charges.length === 0) {
            <p class="mt-2 text-[12.5px] text-ink-3">
              {{ 'finance.ledger.noCharges' | transloco }}
            </p>
          } @else {
            <div class="table-wrap mt-3">
              <table class="table table-compact min-w-[680px]">
                <thead>
                  <tr>
                    <th>{{ 'finance.ledger.description' | transloco }}</th>
                    <th>{{ 'finance.ledger.period' | transloco }}</th>
                    <th>{{ 'finance.ledger.dueDate' | transloco }}</th>
                    <th>{{ 'finance.ledger.amount' | transloco }}</th>
                    <th>{{ 'finance.ledger.paid' | transloco }}</th>
                    <th>{{ 'finance.ledger.remaining' | transloco }}</th>
                    <th>{{ 'finance.ledger.status' | transloco }}</th><th class="w-12"><span class="sr-only">{{ 'common.actions' | transloco }}</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (charge of data.charges; track charge.id) {
                    <tr>
                      <td class="font-medium text-ink">{{ charge.description }}</td>
                      <td>{{ charge.period || ('common.noneFound' | transloco) }}</td>
                      <td class="whitespace-nowrap">{{ format.date(charge.dueDate) }}</td>
                      <td class="tabular-nums">{{ format.money(charge.amount) }}</td>
                      <td class="tabular-nums">{{ format.money(charge.paidAmount) }}</td>
                      <td class="font-semibold tabular-nums">
                        {{ format.money(charge.balance) }}
                      </td>
                      <td><app-status-badge [status]="charge.status" /></td><td>@if (canWrite() && canCancelCharge(charge)) {<button type="button" class="btn-ghost btn-icon-sm" (click)="cancelChargeItem(charge)" [attr.aria-label]="'finance.actions.cancelCharge' | transloco" [title]="'finance.actions.cancelCharge' | transloco"><app-icon name="x" [size]="14" /></button>}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>

        <div class="mt-6">
          <h3 class="text-sm font-semibold text-ink">
            {{ 'finance.ledger.payments' | transloco }}
          </h3>
          @if (data.payments.length === 0) {
            <p class="mt-2 text-[12.5px] text-ink-3">
              {{ 'finance.ledger.noPayments' | transloco }}
            </p>
          } @else {
            <ul class="mt-3 divide-y divide-line rounded-xl border border-line">
              @for (payment of data.payments; track payment.id) {
                <li class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p class="text-[13px] font-semibold tabular-nums text-ink">
                      {{ format.money(payment.amount) }}
                    </p>
                    <p class="text-[11.5px] text-ink-3">
                      {{ ('paymentMethod.' + payment.method) | transloco }} ·
                      {{ format.date(payment.paidAt) }}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[11.5px] text-ink-3">
                      {{ payment.reference || ('common.noneFound' | transloco) }}
                    </span>
                    <button
                      type="button"
                      class="btn-ghost btn-icon-sm"
                      (click)="downloadReceipt(payment)"
                      [attr.aria-label]="'finance.downloadReceipt' | transloco"
                    >
                      <app-icon name="download" [size]="14" />
                    </button>
                    @if (canApprove() && payment.status === 'POSTED') {
                      <button
                        type="button"
                        class="btn-ghost btn-icon-sm"
                        (click)="openVoid(payment)"
                        [attr.aria-label]="'finance.actions.voidPayment' | transloco"
                        [title]="'finance.actions.voidPayment' | transloco"
                      >
                        <app-icon name="x" [size]="14" />
                      </button>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        </div>
      } @else {
        <app-empty-state title="common.noResults" icon="wallet" />
      }

      <div drawer-footer class="flex flex-wrap items-center justify-between gap-2">
        @if (canWrite()) {
          <div class="flex gap-2">
            <button
              type="button"
              class="btn-secondary btn-sm"
              [disabled]="!ledger()"
              (click)="openCharge(ledger()?.student?.id)"
            >
              {{ 'finance.actions.newCharge' | transloco }}
            </button>
            <button
              type="button"
              class="btn-secondary btn-sm"
              [disabled]="!ledger()"
              (click)="openPayment(ledger()?.student?.id)"
            >
              {{ 'finance.actions.recordPayment' | transloco }}
            </button>
          </div>
        }
        <button type="button" class="btn-secondary" (click)="closeLedger()">
          {{ 'common.close' | transloco }}
        </button>
      </div>
    </app-drawer>

    <app-drawer
      [open]="chargeOpen()"
      title="finance.chargeForm.title"
      subtitle="finance.chargeForm.hint"
      size="md"
      [showFooter]="true"
      (closed)="chargeOpen.set(false)"
    >
      <form [formGroup]="chargeForm" class="space-y-4" (ngSubmit)="submitCharge()">
        <label class="field">
          <span class="field-label">{{ 'finance.form.student' | transloco }}</span>
          <select name="studentId" class="select" formControlName="studentId">
            <option value="">{{ 'finance.form.selectStudent' | transloco }}</option>
            @for (student of students(); track student.id) {
              <option [value]="student.id">
                {{ student.lastName }} {{ student.firstName }} · {{ student.registrationNumber }}
              </option>
            }
          </select>
        </label>
        <label class="field">
          <span class="field-label">{{ 'finance.form.description' | transloco }}</span>
          <input name="description" class="input" formControlName="description" maxlength="200" autocomplete="off" />
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="field">
            <span class="field-label">{{ 'finance.form.amount' | transloco }}</span>
            <input name="amount" class="input" type="number" min="0.01" step="0.01" formControlName="amount" autocomplete="off" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'finance.form.dueDate' | transloco }}</span>
            <input name="dueDate" class="input" type="date" formControlName="dueDate" autocomplete="off" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'finance.form.period' | transloco }}</span>
            <input name="period" class="input" formControlName="period" placeholder="2026-10" autocomplete="off" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'finance.form.origin' | transloco }}</span>
            <select name="origin" class="select" formControlName="origin">
              @for (origin of origins; track origin) {
                <option [value]="origin">{{ ('chargeOrigin.' + origin) | transloco }}</option>
              }
            </select>
          </label>
        </div>
        <div drawer-footer class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" (click)="chargeOpen.set(false)">
            {{ 'common.cancel' | transloco }}
          </button>
          <button type="submit" class="btn btn-primary" [disabled]="chargeSaving()">
            {{ (chargeSaving() ? 'common.saving' : 'finance.chargeForm.submit') | transloco }}
          </button>
        </div>
      </form>
    </app-drawer>

    <app-drawer
      [open]="paymentOpen()"
      title="finance.paymentForm.title"
      subtitle="finance.paymentForm.hint"
      size="md"
      [showFooter]="true"
      (closed)="paymentOpen.set(false)"
    >
      <form [formGroup]="paymentForm" class="space-y-4" (ngSubmit)="submitPayment()">
        <label class="field">
          <span class="field-label">{{ 'finance.form.student' | transloco }}</span>
          <select name="studentId" class="select" formControlName="studentId">
            <option value="">{{ 'finance.form.selectStudent' | transloco }}</option>
            @for (student of students(); track student.id) {
              <option [value]="student.id">
                {{ student.lastName }} {{ student.firstName }} · {{ student.registrationNumber }}
              </option>
            }
          </select>
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="field">
            <span class="field-label">{{ 'finance.form.amount' | transloco }}</span>
            <input name="amount" class="input" type="number" min="0.01" step="0.01" formControlName="amount" autocomplete="off" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'finance.form.method' | transloco }}</span>
            <select name="method" class="select" formControlName="method">
              @for (method of methods; track method) {
                <option [value]="method">{{ ('paymentMethod.' + method) | transloco }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'finance.form.paidAt' | transloco }}</span>
            <input name="paidAt" class="input" type="date" formControlName="paidAt" autocomplete="off" />
          </label>
          <label class="field">
            <span class="field-label">{{ 'finance.form.reference' | transloco }}</span>
            <input name="reference" class="input" formControlName="reference" maxlength="100" autocomplete="off" />
          </label>
        </div>
        <label class="field">
          <span class="field-label">{{ 'common.notes' | transloco }}</span>
          <textarea name="notes" class="textarea" rows="2" formControlName="notes" maxlength="1000"></textarea>
        </label>
        <p class="text-[12px] text-ink-3">{{ 'finance.paymentForm.allocationHint' | transloco }}</p>
        <div drawer-footer class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" (click)="paymentOpen.set(false)">
            {{ 'common.cancel' | transloco }}
          </button>
          <button type="submit" class="btn btn-primary" [disabled]="paymentSaving()">
            {{ (paymentSaving() ? 'common.saving' : 'finance.paymentForm.submit') | transloco }}
          </button>
        </div>
      </form>
    </app-drawer>

    <app-drawer
      [open]="voidOpen()"
      title="finance.voidForm.title"
      subtitle="finance.voidForm.hint"
      size="md"
      [showFooter]="true"
      (closed)="voidOpen.set(false)"
    >
      <form [formGroup]="voidForm" class="space-y-4" (ngSubmit)="submitVoid()">
        @if (voidTarget(); as target) {
          <p class="text-[13px] text-ink-2">
            {{ format.money(target.amount) }} · {{ target.receiptNumber }}
          </p>
        }
        <label class="field">
          <span class="field-label">{{ 'finance.voidForm.reason' | transloco }}</span>
          <textarea name="reason"
            class="textarea"
            rows="3"
            formControlName="reason"
            maxlength="300"
          ></textarea>
        </label>
        <div drawer-footer class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" (click)="voidOpen.set(false)">
            {{ 'common.cancel' | transloco }}
          </button>
          <button type="submit" class="btn btn-primary" [disabled]="voidSaving()">
            {{ (voidSaving() ? 'common.saving' : 'finance.voidForm.submit') | transloco }}
          </button>
        </div>
      </form>
    </app-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinancePage {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly format = inject(FormatService);

  readonly canWrite = computed(() => this.auth.has('finance.write'));
  readonly canApprove = computed(() => this.auth.has('finance.approve'));

  readonly tab = signal<FinanceTab>('overview');
  readonly overview = signal<FinanceOverview | null>(null);
  readonly loadingOverview = signal(true);
  readonly payments = signal<Payment[]>([]);
  readonly paymentsTotal = signal(0);
  readonly loadingPayments = signal(false);
  readonly paymentsLoaded = signal(false);
  readonly page = signal(1);
  readonly pageSize = 20;

  readonly ledgerOpen = signal(false);
  readonly ledgerLoading = signal(false);
  readonly ledger = signal<StudentLedger | null>(null);

  readonly students = signal<Student[]>([]);
  readonly chargeOpen = signal(false);
  readonly chargeSaving = signal(false);
  readonly paymentOpen = signal(false);
  readonly paymentSaving = signal(false);

  readonly origins = ['TUITION', 'REGISTRATION', 'EXAM_FEE', 'MATERIAL', 'OTHER'];
  readonly methods = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'];

  readonly chargeForm = this.fb.nonNullable.group({
    studentId: ['', Validators.required],
    description: ['', [Validators.required, Validators.maxLength(200)]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    dueDate: [today(), Validators.required],
    period: [today().slice(0, 7)],
    origin: ['TUITION', Validators.required],
  });

  readonly paymentForm = this.fb.nonNullable.group({
    studentId: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    method: ['CASH', Validators.required],
    paidAt: [today(), Validators.required],
    reference: [''],
    notes: [''],
  });

  readonly voidTarget = signal<Payment | null>(null);
  readonly voidOpen = signal(false);
  readonly voidSaving = signal(false);

  readonly voidForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(300)]],
  });

  readonly searchControl = this.fb.nonNullable.control('');

  readonly tabs: { value: FinanceTab; key: string }[] = [
    { value: 'overview', key: 'finance.tabs.overview' },
    { value: 'payments', key: 'finance.tabs.payments' },
  ];

  readonly debtors = computed(() => {
    const data = this.overview();
    return (data?.topDebtors ?? []).map((debtor) => ({
      studentId: debtor.studentId,
      balance: debtor.balance,
      student:
        debtor.student ?? { id: debtor.studentId, firstName: '—', lastName: '' },
    }));
  });

  readonly chartOptions = computed<EChartsCoreOption | null>(() => {
    const monthly = this.overview()?.monthly ?? [];
    if (monthly.length === 0) return null;
    return {
      color: ['#b9893d', '#2f7d5d'],
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: unknown) => this.format.money(Number(value)),
      },
      legend: {
        top: 0,
        right: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: '#8b949e', fontSize: 11 },
      },
      grid: { left: 8, right: 8, top: 36, bottom: 4, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
      xAxis: {
        type: 'category',
        data: monthly.map((bucket) => this.format.monthLabel(bucket.month)),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#8b949e33' } },
        axisLabel: { color: '#8b949e', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#8b949e33' } },
        axisLabel: {
          color: '#8b949e',
          fontSize: 11,
          formatter: (value: number) => this.format.money(value, true),
        },
      },
      series: [
        {
          name: this.transloco.translate('finance.totals.billed'),
          type: 'bar',
          barMaxWidth: 20,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
          data: monthly.map((bucket) => bucket.billed),
        },
        {
          name: this.transloco.translate('finance.totals.collected'),
          type: 'bar',
          barMaxWidth: 20,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
          data: monthly.map((bucket) => bucket.collected),
        },
      ],
    };
  });

  readonly ledgerTitle = computed(() => {
    const student = this.ledger()?.student;
    const name = student ? `${student.firstName} ${student.lastName}` : '…';
    return this.transloco.translate('finance.ledger.title', { name });
  });

  private paymentsSeq = 0;
  private ledgerSeq = 0;

  constructor() {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => {
        this.page.set(1);
        void this.loadPayments();
      });
    void this.loadStudents();
    void this.loadOverview();
  }

  setTab(tab: FinanceTab): void {
    this.tab.set(tab);
    if (tab === 'payments' && !this.paymentsLoaded() && !this.loadingPayments()) {
      void this.loadPayments();
    }
  }

  goPage(page: number): void {
    this.page.set(page);
    void this.loadPayments();
  }

  async openLedger(studentId: string | null | undefined): Promise<void> {
    if (!studentId) return;
    this.ledgerOpen.set(true);
    this.ledger.set(null);
    this.ledgerLoading.set(true);
    await this.loadLedger(studentId);
  }

  closeLedger(): void {
    this.ledgerSeq += 1;
    this.ledgerOpen.set(false);
    this.ledger.set(null);
    this.ledgerLoading.set(false);
  }

  openCharge(studentId?: string | null): void {
    if (!this.canWrite()) return;
    this.closeLedger();
    this.chargeForm.reset({
      studentId: studentId ?? '',
      description: '',
      amount: 0,
      dueDate: today(),
      period: today().slice(0, 7),
      origin: 'TUITION',
    });
    this.chargeOpen.set(true);
  }

  openPayment(studentId?: string | null): void {
    if (!this.canWrite()) return;
    this.closeLedger();
    this.paymentForm.reset({
      studentId: studentId ?? '',
      amount: 0,
      method: 'CASH',
      paidAt: today(),
      reference: '',
      notes: '',
    });
    this.paymentOpen.set(true);
  }

  async submitCharge(): Promise<void> {
    if (this.chargeForm.invalid) {
      this.chargeForm.markAllAsTouched();
      return;
    }
    if (this.chargeSaving()) return;
    this.chargeSaving.set(true);
    const value = this.chargeForm.getRawValue();
    try {
      await firstValueFrom(
        this.api.post('/finance/charges', {
          studentId: value.studentId,
          description: value.description.trim(),
          amountCents: toCents(value.amount),
          dueDate: value.dueDate,
          period: value.period.trim() || undefined,
          origin: value.origin,
        }),
      );
      this.toast.success(this.transloco.translate('finance.toasts.chargeCreated'));
      this.chargeOpen.set(false);
      await this.refreshAfterMutation();
    } finally {
      this.chargeSaving.set(false);
    }
  }

  async submitPayment(): Promise<void> {
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    if (this.paymentSaving()) return;
    this.paymentSaving.set(true);
    const value = this.paymentForm.getRawValue();
    try {
      const payment = await firstValueFrom(
        this.api.post<Payment>('/finance/payments', {
          studentId: value.studentId,
          amountCents: toCents(value.amount),
          method: value.method,
          paidAt: value.paidAt,
          reference: value.reference.trim() || undefined,
          notes: value.notes.trim() || undefined,
        }),
      );
      this.toast.success(
        this.transloco.translate('finance.toasts.paymentRecorded', {
          receipt: payment.receiptNumber,
        }),
      );
      this.paymentOpen.set(false);
      await this.refreshAfterMutation();
    } finally {
      this.paymentSaving.set(false);
    }
  }

  canCancelCharge(charge: Charge): boolean {
    if (charge.status === 'CANCELLED') return false;
    return Number(charge.paidAmountCents ?? 0) <= 0;
  }

  async cancelChargeItem(charge: Charge): Promise<void> {
    if (!this.canWrite() || !this.canCancelCharge(charge)) return;
    const confirmed = await this.confirm.confirm({
      title: this.transloco.translate('finance.actions.cancelCharge'),
      message: this.transloco.translate('finance.cancelChargeConfirm'),
      confirmLabel: this.transloco.translate('common.delete'),
      cancelLabel: this.transloco.translate('common.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await firstValueFrom(this.api.post(`/finance/charges/${charge.id}/cancel`, {}));
      this.toast.success(this.transloco.translate('finance.toasts.chargeCancelled'));
      await this.refreshAfterMutation();
    } catch {
      // The global error interceptor reports the failure.
    }
  }

  openVoid(payment: Payment): void {
    if (!this.canApprove() || payment.status !== 'POSTED') return;
    this.voidTarget.set(payment);
    this.voidForm.reset({ reason: '' });
    this.voidOpen.set(true);
  }

  async submitVoid(): Promise<void> {
    const target = this.voidTarget();
    if (this.voidForm.invalid || !target) {
      this.voidForm.markAllAsTouched();
      return;
    }
    if (this.voidSaving()) return;
    this.voidSaving.set(true);
    try {
      await firstValueFrom(
        this.api.post(`/finance/payments/${target.id}/void`, {
          reason: this.voidForm.getRawValue().reason.trim(),
        }),
      );
      this.toast.success(this.transloco.translate('finance.toasts.paymentVoided'));
      this.voidOpen.set(false);
      this.voidTarget.set(null);
      await this.refreshAfterMutation();
    } finally {
      this.voidSaving.set(false);
    }
  }

  async downloadReceipt(payment: Payment): Promise<void> {
    try {
      const blob = await firstValueFrom(
        this.api.blob(`/finance/payments/${payment.id}/receipt.pdf`),
      );
      saveBlob(blob, `apodeixi-${payment.receiptNumber}.pdf`);
    } catch {
      // The global error interceptor reports the failure.
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

  private async refreshAfterMutation(): Promise<void> {
    const ledgerStudentId = this.ledger()?.student.id;
    await this.loadOverview();
    if (this.paymentsLoaded()) await this.loadPayments();
    if (this.ledgerOpen() && ledgerStudentId) await this.loadLedger(ledgerStudentId);
  }

  private async loadLedger(studentId: string): Promise<void> {
    const seq = ++this.ledgerSeq;
    this.ledgerLoading.set(true);
    try {
      const data = await firstValueFrom(
        this.api.get<StudentLedger>(`/finance/students/${studentId}/ledger`),
      );
      if (seq !== this.ledgerSeq) return;
      this.ledger.set(data);
    } catch {
      if (seq === this.ledgerSeq) this.ledger.set(null);
    } finally {
      if (seq === this.ledgerSeq) this.ledgerLoading.set(false);
    }
  }

  private async loadOverview(): Promise<void> {
    this.loadingOverview.set(true);
    try {
      const overview = await firstValueFrom(this.api.get<FinanceOverview>('/finance/overview'));
      this.overview.set(overview);
    } catch {
      this.overview.set(null);
    } finally {
      this.loadingOverview.set(false);
    }
  }

  private async loadPayments(): Promise<void> {
    const seq = ++this.paymentsSeq;
    this.loadingPayments.set(true);
    try {
      const response = await firstValueFrom(
        this.api.list<Payment>('/finance/payments', {
          page: this.page(),
          pageSize: this.pageSize,
          search: this.searchControl.value.trim() || undefined,
        }),
      );
      if (seq !== this.paymentsSeq) return;
      this.payments.set(response.data);
      this.paymentsTotal.set(response.meta?.total ?? response.data.length);
      this.paymentsLoaded.set(true);
    } catch {
      if (seq === this.paymentsSeq) {
        this.payments.set([]);
        this.paymentsTotal.set(0);
      }
    } finally {
      if (seq === this.paymentsSeq) this.loadingPayments.set(false);
    }
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toCents(value: number): number {
  return Math.round(Number(value) * 100);
}
