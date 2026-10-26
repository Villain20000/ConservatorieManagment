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
import { TranslocoService } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import type {
  Asset,
  AssetCategory,
  AssetCondition,
  AssetLoan,
  AssetStatus,
  Branch,
  Student,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

@Component({
  selector: 'app-inventory-page',
  imports: [...SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="inventory.title" subtitle="inventory.subtitle">
        @if (canWrite()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <app-icon name="plus" [size]="16" />
            {{ 'inventory.newAsset' | transloco }}
          </button>
        }
      </app-page-header>

      <!-- Tuning Alerts Banner (442 Hz European Conservatory Standard) -->
      @if (tuningAlerts(); as alerts) {
        @if (alerts.totalNeedingAttention > 0) {
          <div class="mb-6 p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                <app-icon name="alert" [size]="20" />
              </div>
              <div>
                <h4 class="font-bold text-sm">
                  {{ 'inventory.tuningAttentionNeeded' | transloco }}
                  <span class="text-xs font-mono font-normal ml-1 bg-amber-200/70 dark:bg-amber-900/70 px-1.5 py-0.5 rounded">442 Hz</span>
                </h4>
                <div class="text-xs text-amber-700 dark:text-amber-300">
                  @if (alerts.overdueCount > 0) {
                    <span class="font-bold text-red-600 dark:text-red-400">{{ alerts.overdueCount }} {{ 'inventory.overduePianos' | transloco }}</span> •
                  }
                  {{ alerts.dueSoonCount }} {{ 'inventory.dueSoonPianos' | transloco }}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-xs btn-secondary bg-white dark:bg-slate-900" (click)="filterTuningOverdue()">
                {{ 'inventory.viewPianos' | transloco }}
              </button>
            </div>
          </div>
        }
      }

      <!-- Stats Bar -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="card p-4 flex items-center gap-3">
          <div class="p-3 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
            <app-icon name="layers" [size]="22" />
          </div>
          <div>
            <div class="text-xs text-slate-500 uppercase tracking-wide">{{ 'inventory.totalAssets' | transloco }}</div>
            <div class="text-xl font-bold">{{ assets().length }}</div>
          </div>
        </div>
        <div class="card p-4 flex items-center gap-3">
          <div class="p-3 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <app-icon name="check-circle" [size]="22" />
          </div>
          <div>
            <div class="text-xs text-slate-500 uppercase tracking-wide">{{ 'inventory.available' | transloco }}</div>
            <div class="text-xl font-bold">{{ availableCount() }}</div>
          </div>
        </div>
        <div class="card p-4 flex items-center gap-3">
          <div class="p-3 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
            <app-icon name="briefcase" [size]="22" />
          </div>
          <div>
            <div class="text-xs text-slate-500 uppercase tracking-wide">{{ 'inventory.onLoan' | transloco }}</div>
            <div class="text-xl font-bold">{{ onLoanCount() }}</div>
          </div>
        </div>
        <div class="card p-4 flex items-center gap-3">
          <div class="p-3 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
            <app-icon name="music" [size]="22" />
          </div>
          <div>
            <div class="text-xs text-slate-500 uppercase tracking-wide">{{ 'inventory.concertPianos' | transloco }}</div>
            <div class="text-xl font-bold">{{ pianoCount() }}</div>
          </div>
        </div>
      </div>

      <!-- Filters Bar -->
      <div class="card p-4 mb-6 flex flex-wrap gap-3 items-center justify-between">
        <div class="flex flex-wrap gap-3 items-center flex-1">
          <div class="relative min-w-[200px] flex-1 max-w-xs">
            <app-icon name="search" [size]="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              class="input pl-9"
              [placeholder]="'inventory.searchPlaceholder' | transloco"
              [value]="searchTerm()"
              (input)="searchTerm.set($any($event.target).value)"
            />
          </div>

          <select class="input max-w-[170px]" [value]="selectedCategory()" (change)="selectedCategory.set($any($event.target).value)">
            <option value="">{{ 'inventory.allCategories' | transloco }}</option>
            <option value="GRAND_PIANO">{{ 'inventory.categories.GRAND_PIANO' | transloco }}</option>
            <option value="UPRIGHT_PIANO">{{ 'inventory.categories.UPRIGHT_PIANO' | transloco }}</option>
            <option value="STRING_INSTRUMENT">{{ 'inventory.categories.STRING_INSTRUMENT' | transloco }}</option>
            <option value="WOODWIND">{{ 'inventory.categories.WOODWIND' | transloco }}</option>
            <option value="BRASS">{{ 'inventory.categories.BRASS' | transloco }}</option>
            <option value="PERCUSSION">{{ 'inventory.categories.PERCUSSION' | transloco }}</option>
            <option value="AUDIO_EQUIPMENT">{{ 'inventory.categories.AUDIO_EQUIPMENT' | transloco }}</option>
          </select>

          <select class="input max-w-[150px]" [value]="selectedStatus()" (change)="selectedStatus.set($any($event.target).value)">
            <option value="">{{ 'inventory.allStatuses' | transloco }}</option>
            <option value="AVAILABLE">{{ 'inventory.status.AVAILABLE' | transloco }}</option>
            <option value="ON_LOAN">{{ 'inventory.status.ON_LOAN' | transloco }}</option>
            <option value="IN_USE_STUDIO">{{ 'inventory.status.IN_USE_STUDIO' | transloco }}</option>
            <option value="IN_MAINTENANCE">{{ 'inventory.status.IN_MAINTENANCE' | transloco }}</option>
          </select>

          @if (branches().length > 1) {
            <select class="input max-w-[150px]" [value]="selectedBranch()" (change)="selectedBranch.set($any($event.target).value)">
              <option value="">{{ 'inventory.allBranches' | transloco }}</option>
              @for (b of branches(); track b.id) {
                <option [value]="b.id">{{ b.name }}</option>
              }
            </select>
          }
        </div>
      </div>

      <!-- Assets Grid -->
      @if (loading()) {
        <div class="card p-8 text-center text-slate-500">
          <app-icon name="refresh" [size]="24" class="animate-spin mx-auto mb-2 text-slate-400" />
          {{ 'common.loading' | transloco }}
        </div>
      } @else if (filteredAssets().length === 0) {
        <div class="card p-12 text-center text-slate-500">
          <app-icon name="layers" [size]="40" class="mx-auto mb-3 text-slate-300" />
          <h3 class="text-base font-semibold mb-1">{{ 'inventory.noAssets' | transloco }}</h3>
          <p class="text-sm text-slate-400 mb-4">{{ 'inventory.noAssetsHint' | transloco }}</p>
          @if (canWrite()) {
            <button type="button" class="btn btn-secondary" (click)="openCreate()">
              {{ 'inventory.newAsset' | transloco }}
            </button>
          }
        </div>
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          @for (a of filteredAssets(); track a.id) {
            <div class="card hover:border-brand-500/50 transition-all flex flex-col justify-between p-5">
              <div>
                <div class="flex items-center justify-between gap-2 mb-2">
                  <span class="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {{ a.assetTag }}
                  </span>
                  <span class="text-xs font-semibold px-2 py-0.5 rounded-full" [class]="getStatusBadgeClass(a.status)">
                    {{ 'inventory.status.' + a.status | transloco }}
                  </span>
                </div>

                <h3 class="font-bold text-base text-slate-900 dark:text-slate-100 mb-0.5 line-clamp-1">
                  {{ a.manufacturer }} {{ a.model }}
                </h3>
                <div class="text-xs text-slate-500 mb-3">
                  {{ 'inventory.categories.' + a.category | transloco }}
                  @if (a.serialNumber) { • S/N: <span class="font-mono">{{ a.serialNumber }}</span> }
                </div>

                <div class="space-y-1 text-xs text-slate-600 dark:text-slate-400 mb-4">
                  <div class="flex items-center justify-between">
                    <span class="text-slate-400">{{ 'inventory.condition' | transloco }}:</span>
                    <span class="font-medium" [class]="getConditionClass(a.condition)">
                      {{ 'inventory.conditions.' + a.condition | transloco }}
                    </span>
                  </div>

                  @if (a.requiresTuning) {
                    <div class="flex items-center justify-between">
                      <span class="text-slate-400">{{ 'inventory.pitchStandard' | transloco }}:</span>
                      <span class="font-mono font-bold text-brand-600 dark:text-brand-400">{{ a.pitchStandardHz }} Hz</span>
                    </div>
                  }

                  <div class="flex items-center justify-between">
                    <span class="text-slate-400">{{ 'inventory.location' | transloco }}:</span>
                    <span>{{ a.branch?.name }} @if (a.studioRoom) { ({{ a.studioRoom.name }}) }</span>
                  </div>

                  @if (a.status === 'ON_LOAN' && a.loans && a.loans.length > 0) {
                    <div class="mt-2 p-2 rounded bg-purple-50 dark:bg-purple-950/50 text-purple-900 dark:text-purple-300 text-xs">
                      <div class="font-semibold">{{ 'inventory.borrowedBy' | transloco }}: {{ a.loans[0].student?.firstName }} {{ a.loans[0].student?.lastName }}</div>
                      <div>{{ 'inventory.returnDue' | transloco }}: {{ formatDate(a.loans[0].expectedReturnDate) }}</div>
                    </div>
                  }
                </div>
              </div>

              <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <div class="flex items-center gap-1">
                  @if (a.requiresTuning && canMaintain()) {
                    <button type="button" class="btn btn-xs btn-secondary" (click)="openMaintenance(a)">
                      <app-icon name="timer" [size]="14" />
                      {{ 'inventory.logTuning' | transloco }}
                    </button>
                  }
                </div>

                <div class="flex items-center gap-1.5">
                  @if (a.status === 'AVAILABLE' && a.isLoanable && canLoan()) {
                    <button type="button" class="btn btn-xs btn-primary" (click)="openCheckout(a)">
                      <app-icon name="arrow-right" [size]="14" />
                      {{ 'inventory.checkout' | transloco }}
                    </button>
                  } @else if (a.status === 'ON_LOAN' && a.loans && a.loans.length > 0 && canLoan()) {
                    <button type="button" class="btn btn-xs btn-secondary" (click)="openReturn(a.loans[0])">
                      <app-icon name="check" [size]="14" />
                      {{ 'inventory.return' | transloco }}
                    </button>
                  }

                  @if (canWrite()) {
                    <button type="button" class="btn btn-xs btn-ghost text-red-500" (click)="deleteAsset(a)">
                      <app-icon name="trash" [size]="14" />
                    </button>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Create Asset Drawer -->
      <app-drawer [open]="isCreateOpen()" [title]="'inventory.createTitle' | transloco" (closed)="isCreateOpen.set(false)"
      >
        <form [formGroup]="createForm" (ngSubmit)="submitCreate()" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
<label class="label">{{ 'inventory.assetTag' | transloco }}</label>
              <input type="text" formControlName="assetTag" class="input font-mono uppercase" placeholder="π.χ. ARM-PNO-005" />
            </div>

            <div>
<label class="label">{{ 'inventory.category' | transloco }}</label>
              <select formControlName="category" class="input">
                <option value="GRAND_PIANO">{{ 'inventory.categories.GRAND_PIANO' | transloco }}</option>
                <option value="UPRIGHT_PIANO">{{ 'inventory.categories.UPRIGHT_PIANO' | transloco }}</option>
                <option value="STRING_INSTRUMENT">{{ 'inventory.categories.STRING_INSTRUMENT' | transloco }}</option>
                <option value="WOODWIND">{{ 'inventory.categories.WOODWIND' | transloco }}</option>
                <option value="BRASS">{{ 'inventory.categories.BRASS' | transloco }}</option>
                <option value="PERCUSSION">{{ 'inventory.categories.PERCUSSION' | transloco }}</option>
                <option value="AUDIO_EQUIPMENT">{{ 'inventory.categories.AUDIO_EQUIPMENT' | transloco }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
<label class="label">{{ 'inventory.manufacturer' | transloco }}</label>
              <input type="text" formControlName="manufacturer" class="input" placeholder="π.χ. Steinway & Sons" />
            </div>

            <div>
<label class="label">{{ 'inventory.model' | transloco }}</label>
              <input type="text" formControlName="model" class="input" placeholder="π.χ. Model B Grand" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
<label class="label">{{ 'inventory.serialNumber' | transloco }}</label>
              <input type="text" formControlName="serialNumber" class="input font-mono" />
            </div>

            <div>
<label class="label">{{ 'inventory.branch' | transloco }}</label>
              <select formControlName="branchId" class="input">
                @for (b of branches(); track b.id) {
                  <option [value]="b.id">{{ b.name }}</option>
                }
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
<label class="label">{{ 'inventory.condition' | transloco }}</label>
              <select formControlName="condition" class="input">
                <option value="PRISTINE">{{ 'inventory.conditions.PRISTINE' | transloco }}</option>
                <option value="EXCELLENT">{{ 'inventory.conditions.EXCELLENT' | transloco }}</option>
                <option value="GOOD">{{ 'inventory.conditions.GOOD' | transloco }}</option>
                <option value="FAIR">{{ 'inventory.conditions.FAIR' | transloco }}</option>
                <option value="NEEDS_REPAIR">{{ 'inventory.conditions.NEEDS_REPAIR' | transloco }}</option>
              </select>
            </div>

            <div>
<label class="label">{{ 'inventory.pitchStandard' | transloco }}</label>
              <select formControlName="pitchStandardHz" class="input">
                <option [value]="442">442 Hz (European / Greek Classical Standard)</option>
                <option [value]="440">440 Hz (Standard Concert Pitch)</option>
              </select>
            </div>
          </div>

          <div class="flex gap-6 py-2">
            <label class="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" formControlName="isLoanable" class="checkbox" />
              <span>{{ 'inventory.loanableToStudents' | transloco }}</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" formControlName="requiresTuning" class="checkbox" />
              <span>{{ 'inventory.requiresTuning' | transloco }}</span>
            </label>
          </div>

          <div class="flex justify-end gap-2 pt-4">
            <button type="button" class="btn btn-secondary" (click)="isCreateOpen.set(false)">
              {{ 'common.cancel' | transloco }}
            </button>
            <button type="submit" class="btn btn-primary" [disabled]="createForm.invalid || creating()">
              {{ 'common.save' | transloco }}
            </button>
          </div>
        </form>
      </app-drawer>

      <!-- Checkout Loan Modal -->
      @if (activeLoanAsset(); as asset) {
        <div class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div class="card w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150">
            <div class="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 class="font-bold text-lg">{{ 'inventory.checkoutInstrument' | transloco }}</h3>
                <div class="text-xs text-slate-500 font-mono">{{ asset.assetTag }} • {{ asset.manufacturer }} {{ asset.model }}</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" (click)="activeLoanAsset.set(null)">
                <app-icon name="x" [size]="18" />
              </button>
            </div>

            <form [formGroup]="loanForm" (ngSubmit)="submitCheckout()" class="space-y-4 mt-4">
              <div>
<label class="label">{{ 'inventory.student' | transloco }}</label>
                <select formControlName="studentId" class="input">
                  <option value="">{{ 'inventory.selectStudent' | transloco }}</option>
                  @for (s of students(); track s.id) {
                    <option [value]="s.id">{{ s.firstName }} {{ s.lastName }} ({{ s.registrationNumber }})</option>
                  }
                </select>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
<label class="label">{{ 'inventory.loanDate' | transloco }}</label>
                  <input type="date" formControlName="loanDate" class="input" />
                </div>

                <div>
<label class="label">{{ 'inventory.expectedReturnDate' | transloco }}</label>
                  <input type="date" formControlName="expectedReturnDate" class="input" />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
<label class="label">{{ 'inventory.loanFeeCents' | transloco }}</label>
                  <input type="number" formControlName="loanFeeCents" class="input" placeholder="0 €" />
                </div>

                <div>
<label class="label">{{ 'inventory.depositCents' | transloco }}</label>
                  <input type="number" formControlName="depositCents" class="input" placeholder="0 €" />
                </div>
              </div>

              <div>
<label class="label">{{ 'inventory.checkoutNotes' | transloco }}</label>
                <textarea formControlName="checkoutNotes" class="input min-h-[60px]" placeholder="Αξεσουάρ, δοξάρι, θήκη, κατάσταση..."></textarea>
              </div>

              <div class="flex justify-end gap-2 pt-2">
                <button type="button" class="btn btn-secondary" (click)="activeLoanAsset.set(null)">
                  {{ 'common.cancel' | transloco }}
                </button>
                <button type="submit" class="btn btn-primary" [disabled]="loanForm.invalid || processingLoan()">
                  {{ 'inventory.confirmCheckout' | transloco }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Return Loan Modal -->
      @if (activeReturnLoan(); as loan) {
        <div class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div class="card w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <div class="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 class="font-bold text-lg">{{ 'inventory.returnInstrument' | transloco }}</h3>
                <div class="text-xs text-slate-500">
                  {{ loan.student?.firstName }} {{ loan.student?.lastName }} • {{ loan.asset?.assetTag }}
                </div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" (click)="activeReturnLoan.set(null)">
                <app-icon name="x" [size]="18" />
              </button>
            </div>

            <form [formGroup]="returnForm" (ngSubmit)="submitReturn()" class="space-y-4 mt-4">
              <div>
<label class="label">{{ 'inventory.inspectedCondition' | transloco }}</label>
                <select formControlName="returnCondition" class="input">
                  <option value="PRISTINE">{{ 'inventory.conditions.PRISTINE' | transloco }}</option>
                  <option value="EXCELLENT">{{ 'inventory.conditions.EXCELLENT' | transloco }}</option>
                  <option value="GOOD">{{ 'inventory.conditions.GOOD' | transloco }}</option>
                  <option value="FAIR">{{ 'inventory.conditions.FAIR' | transloco }}</option>
                  <option value="NEEDS_REPAIR">{{ 'inventory.conditions.NEEDS_REPAIR' | transloco }}</option>
                </select>
              </div>

              <div>
<label class="label">{{ 'inventory.damageFeeCents' | transloco }}</label>
                <input type="number" formControlName="damageFeeCents" class="input" placeholder="0" />
              </div>

              <div>
<label class="label">{{ 'inventory.returnNotes' | transloco }}</label>
                <textarea formControlName="returnNotes" class="input min-h-[60px]" placeholder="Παρατηρήσεις επιστροφής..."></textarea>
              </div>

              <label class="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" formControlName="refundDeposit" class="checkbox" />
                <span>{{ 'inventory.refundDeposit' | transloco }} ({{ (loan.depositCents / 100).toFixed(2) }} €)</span>
              </label>

              <div class="flex justify-end gap-2 pt-2">
                <button type="button" class="btn btn-secondary" (click)="activeReturnLoan.set(null)">
                  {{ 'common.cancel' | transloco }}
                </button>
                <button type="submit" class="btn btn-primary" [disabled]="returnForm.invalid || processingLoan()">
                  {{ 'inventory.completeReturn' | transloco }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Piano Tuning / Maintenance Modal -->
      @if (activeMaintenanceAsset(); as asset) {
        <div class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div class="card w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150">
            <div class="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 class="font-bold text-lg">{{ 'inventory.logTuningService' | transloco }}</h3>
                <div class="text-xs text-slate-500 font-mono">{{ asset.assetTag }} • {{ asset.manufacturer }} {{ asset.model }}</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" (click)="activeMaintenanceAsset.set(null)">
                <app-icon name="x" [size]="18" />
              </button>
            </div>

            <form [formGroup]="maintForm" (ngSubmit)="submitMaintenance()" class="space-y-4 mt-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
<label class="label">{{ 'inventory.technicianName' | transloco }}</label>
                  <input type="text" formControlName="technicianName" class="input" placeholder="π.χ. Νικόλαος Καραγκούνης" />
                </div>

                <div>
<label class="label">{{ 'inventory.technicianCompany' | transloco }}</label>
                  <input type="text" formControlName="technicianCompany" class="input" placeholder="Hellas Piano Services" />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
<label class="label">{{ 'inventory.serviceDate' | transloco }}</label>
                  <input type="date" formControlName="serviceDate" class="input" />
                </div>

                <div>
<label class="label">{{ 'inventory.nextServiceDue' | transloco }}</label>
                  <input type="date" formControlName="nextServiceDue" class="input" />
                </div>
              </div>

              <div class="grid grid-cols-3 gap-3">
                <div>
<label class="label">{{ 'inventory.pitchLeftHz' | transloco }}</label>
                  <input type="number" step="0.1" formControlName="pitchLeftHz" class="input font-mono font-bold" />
                </div>

                <div>
<label class="label">{{ 'inventory.costCents' | transloco }}</label>
                  <input type="number" formControlName="costCents" class="input" placeholder="120 €" />
                </div>

                <div>
<label class="label">{{ 'inventory.invoiceNo' | transloco }}</label>
                  <input type="text" formControlName="invoiceNumber" class="input font-mono uppercase" placeholder="ΤΠΥ-..." />
                </div>
              </div>

              <div>
<label class="label">{{ 'inventory.workPerformed' | transloco }}</label>
                <textarea formControlName="workPerformed" class="input min-h-[60px]" placeholder="Κούρδισμα συναυλίας στα 442Hz..."></textarea>
              </div>

              <div class="flex justify-end gap-2 pt-2">
                <button type="button" class="btn btn-secondary" (click)="activeMaintenanceAsset.set(null)">
                  {{ 'common.cancel' | transloco }}
                </button>
                <button type="submit" class="btn btn-primary" [disabled]="maintForm.invalid || processingMaint()">
                  {{ 'common.save' | transloco }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  readonly assets = signal<Asset[]>([]);
  readonly branches = signal<Branch[]>([]);
  readonly students = signal<Student[]>([]);
  readonly tuningAlerts = signal<any | null>(null);
  readonly loading = signal(true);

  readonly searchTerm = signal('');
  readonly selectedCategory = signal('');
  readonly selectedStatus = signal('');
  readonly selectedBranch = signal('');

  readonly isCreateOpen = signal(false);
  readonly creating = signal(false);
  readonly processingLoan = signal(false);
  readonly processingMaint = signal(false);

  readonly activeLoanAsset = signal<Asset | null>(null);
  readonly activeReturnLoan = signal<AssetLoan | null>(null);
  readonly activeMaintenanceAsset = signal<Asset | null>(null);

  readonly canWrite = computed(() => this.auth.has('inventory.write'));
  readonly canLoan = computed(() => this.auth.has('inventory.loan') || this.auth.has('inventory.write'));
  readonly canMaintain = computed(() => this.auth.has('inventory.maintain') || this.auth.has('inventory.write'));

  readonly availableCount = computed(
    () => this.assets().filter((a) => a.status === 'AVAILABLE').length,
  );

  readonly onLoanCount = computed(
    () => this.assets().filter((a) => a.status === 'ON_LOAN').length,
  );

  readonly pianoCount = computed(
    () =>
      this.assets().filter(
        (a) => a.category === 'GRAND_PIANO' || a.category === 'UPRIGHT_PIANO',
      ).length,
  );

  readonly filteredAssets = computed(() => {
    let list = this.assets();
    const term = this.searchTerm().trim().toLowerCase();
    if (term) {
      list = list.filter(
        (a) =>
          a.assetTag.toLowerCase().includes(term) ||
          a.manufacturer.toLowerCase().includes(term) ||
          a.model.toLowerCase().includes(term) ||
          (a.serialNumber && a.serialNumber.toLowerCase().includes(term)),
      );
    }
    const cat = this.selectedCategory();
    if (cat) {
      list = list.filter((a) => a.category === cat);
    }
    const status = this.selectedStatus();
    if (status) {
      list = list.filter((a) => a.status === status);
    }
    const branch = this.selectedBranch();
    if (branch) {
      list = list.filter((a) => a.branchId === branch);
    }
    return list;
  });

  readonly createForm = this.fb.group({
    assetTag: ['', Validators.required],
    category: ['GRAND_PIANO', Validators.required],
    manufacturer: ['', Validators.required],
    model: ['', Validators.required],
    serialNumber: [''],
    branchId: ['', Validators.required],
    condition: ['EXCELLENT', Validators.required],
    pitchStandardHz: [442, Validators.required],
    isLoanable: [false],
    requiresTuning: [true],
  });

  readonly loanForm = this.fb.group({
    studentId: ['', Validators.required],
    loanDate: [new Date().toISOString().slice(0, 10), Validators.required],
    expectedReturnDate: ['', Validators.required],
    loanFeeCents: [0],
    depositCents: [0],
    checkoutNotes: [''],
  });

  readonly returnForm = this.fb.group({
    returnCondition: ['GOOD', Validators.required],
    damageFeeCents: [0],
    returnNotes: [''],
    refundDeposit: [true],
  });

  readonly maintForm = this.fb.group({
    technicianName: ['', Validators.required],
    technicianCompany: [''],
    serviceDate: [new Date().toISOString().slice(0, 10), Validators.required],
    nextServiceDue: [''],
    pitchLeftHz: [442.0, Validators.required],
    costCents: [12000],
    invoiceNumber: [''],
    workPerformed: ['Κούρδισμα συναυλίας στα 442Hz.', Validators.required],
  });

  constructor() {
    this.loadBranches();
    this.loadStudents();
    this.loadAssets();
    this.loadTuningAlerts();
  }

  loadBranches() {
    this.api
      .get<{ items: Branch[] }>('/academics/branches')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.branches.set(res.items || []);
          if (res.items?.length && !this.createForm.value.branchId) {
            this.createForm.patchValue({ branchId: res.items[0].id });
          }
        },
      });
  }

  loadStudents() {
    this.api
      .get<{ items: Student[] }>('/students')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.students.set(res.items || []),
      });
  }

  loadAssets() {
    this.loading.set(true);
    this.api
      .get<{ items: Asset[] }>('/inventory/assets')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.assets.set(res.items || []);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toast.error(this.transloco.translate('common.loadFailed'));
        },
      });
  }

  loadTuningAlerts() {
    this.api
      .get('/inventory/alerts/tuning')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (alerts) => this.tuningAlerts.set(alerts),
      });
  }

  filterTuningOverdue() {
    this.selectedCategory.set('');
    this.selectedStatus.set('');
    this.searchTerm.set('ARM-PNO');
  }

  openCreate() {
    this.createForm.patchValue({
      assetTag: `ARM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      category: 'GRAND_PIANO',
      manufacturer: '',
      model: '',
      serialNumber: '',
      condition: 'EXCELLENT',
      pitchStandardHz: 442,
      isLoanable: false,
      requiresTuning: true,
    });
    this.isCreateOpen.set(true);
  }

  submitCreate() {
    if (this.createForm.invalid) return;
    this.creating.set(true);

    this.api
      .post<Asset>('/inventory/assets', this.createForm.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.toast.success(this.transloco.translate('inventory.createSuccess'));
          this.assets.update((list) => [created, ...list]);
          this.isCreateOpen.set(false);
          this.creating.set(false);
        },
        error: (err) => {
          this.toast.error(err.error?.message || this.transloco.translate('common.saveFailed'));
          this.creating.set(false);
        },
      });
  }

  openCheckout(asset: Asset) {
    const returnDate = new Date();
    returnDate.setDate(returnDate.getDate() + (asset.maxLoanDays || 30));

    this.loanForm.patchValue({
      studentId: '',
      loanDate: new Date().toISOString().slice(0, 10),
      expectedReturnDate: returnDate.toISOString().slice(0, 10),
      loanFeeCents: 0,
      depositCents: 5000,
      checkoutNotes: '',
    });
    this.activeLoanAsset.set(asset);
  }

  submitCheckout() {
    const asset = this.activeLoanAsset();
    if (!asset || this.loanForm.invalid) return;
    this.processingLoan.set(true);

    const payload = {
      ...this.loanForm.value,
      assetId: asset.id,
    };

    this.api
      .post('/inventory/loans', payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.transloco.translate('inventory.checkoutSuccess'));
          this.activeLoanAsset.set(null);
          this.processingLoan.set(false);
          this.loadAssets();
        },
        error: (err) => {
          this.toast.error(err.error?.message || this.transloco.translate('common.saveFailed'));
          this.processingLoan.set(false);
        },
      });
  }

  openReturn(loan: AssetLoan) {
    this.returnForm.patchValue({
      returnCondition: loan.checkoutCondition,
      damageFeeCents: 0,
      returnNotes: '',
      refundDeposit: true,
    });
    this.activeReturnLoan.set(loan);
  }

  submitReturn() {
    const loan = this.activeReturnLoan();
    if (!loan || this.returnForm.invalid) return;
    this.processingLoan.set(true);

    this.api
      .post(`/inventory/loans/${loan.id}/return`, this.returnForm.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.transloco.translate('inventory.returnSuccess'));
          this.activeReturnLoan.set(null);
          this.processingLoan.set(false);
          this.loadAssets();
        },
        error: (err) => {
          this.toast.error(err.error?.message || this.transloco.translate('common.saveFailed'));
          this.processingLoan.set(false);
        },
      });
  }

  openMaintenance(asset: Asset) {
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + (asset.tuningIntervalDays || 90));

    this.maintForm.patchValue({
      technicianName: '',
      technicianCompany: '',
      serviceDate: new Date().toISOString().slice(0, 10),
      nextServiceDue: nextDue.toISOString().slice(0, 10),
      pitchLeftHz: asset.pitchStandardHz || 442.0,
      costCents: 12000,
      invoiceNumber: '',
      workPerformed: 'Κούρδισμα συναυλίας στα 442Hz.',
    });
    this.activeMaintenanceAsset.set(asset);
  }

  submitMaintenance() {
    const asset = this.activeMaintenanceAsset();
    if (!asset || this.maintForm.invalid) return;
    this.processingMaint.set(true);

    const payload = {
      ...this.maintForm.value,
      assetId: asset.id,
      maintenanceType: 'PIANO_TUNING',
    };

    this.api
      .post('/inventory/maintenance', payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.transloco.translate('inventory.maintenanceSuccess'));
          this.activeMaintenanceAsset.set(null);
          this.processingMaint.set(false);
          this.loadAssets();
          this.loadTuningAlerts();
        },
        error: (err) => {
          this.toast.error(err.error?.message || this.transloco.translate('common.saveFailed'));
          this.processingMaint.set(false);
        },
      });
  }

  deleteAsset(asset: Asset) {
    this.confirm
      .confirm({
        title: this.transloco.translate('inventory.deleteTitle'),
        message: this.transloco.translate('inventory.deleteConfirm', { tag: asset.assetTag }),
        confirmLabel: this.transloco.translate('common.delete'),
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.api
          .delete(`/inventory/assets/${asset.id}`)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.toast.success(this.transloco.translate('inventory.deleteSuccess'));
              this.assets.update((list) => list.filter((a) => a.id !== asset.id));
            },
          });
      });
  }

  formatDate(val: string): string {
    return new Date(val).toLocaleDateString('el-GR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  getStatusBadgeClass(status: AssetStatus): string {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
      case 'ON_LOAN':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300';
      case 'IN_USE_STUDIO':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
      case 'IN_MAINTENANCE':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  }

  getConditionClass(condition: AssetCondition): string {
    switch (condition) {
      case 'PRISTINE':
      case 'EXCELLENT':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'GOOD':
        return 'text-blue-600 dark:text-blue-400';
      case 'FAIR':
        return 'text-amber-600 dark:text-amber-400';
      default:
        return 'text-red-600 dark:text-red-400';
    }
  }
}
