import { HttpErrorResponse } from '@angular/common/http';
import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { addDaysKey, todayKey } from '../../core/dates';
import { FormatService } from '../../core/format.service';
import type {
  AcademicYear,
  AcademicsOptions,
  Branch,
  Level,
  Program,
  Room,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

type TabKey = 'programs' | 'levels' | 'years' | 'branches' | 'rooms';

interface TabDefinition {
  key: TabKey;
  label: string;
  icon: string;
  count: number;
}

const TAB_META: Record<TabKey, { label: string; icon: string; empty: string; add: string; edit: string }> = {
  programs: {
    label: 'academics.tabs.programs',
    icon: 'music',
    empty: 'academics.emptyPrograms',
    add: 'academics.addProgram',
    edit: 'academics.editProgram',
  },
  levels: {
    label: 'academics.tabs.levels',
    icon: 'layers',
    empty: 'academics.emptyLevels',
    add: 'academics.addLevel',
    edit: 'academics.editLevel',
  },
  years: {
    label: 'academics.tabs.years',
    icon: 'calendar',
    empty: 'academics.emptyYears',
    add: 'academics.addYear',
    edit: 'academics.editYear',
  },
  branches: {
    label: 'academics.tabs.branches',
    icon: 'building',
    empty: 'academics.emptyBranches',
    add: 'academics.addBranch',
    edit: 'academics.editBranch',
  },
  rooms: {
    label: 'academics.tabs.rooms',
    icon: 'map-pin',
    empty: 'academics.emptyRooms',
    add: 'academics.addRoom',
    edit: 'academics.editRoom',
  },
};

const DEFAULT_COLOR = '#b9893d';

@Component({
  selector: 'app-academics-page',
  imports: [...SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="academics.title" subtitle="academics.subtitle">
        @if (canWrite()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <app-icon name="plus" [size]="16" />
            {{ currentMeta().add | transloco }}
          </button>
        }
      </app-page-header>

      <div class="mb-4 flex flex-wrap gap-1.5" role="tablist">
        @for (tab of tabs(); track tab.key) {
          <button
            type="button"
            role="tab"
            class="btn btn-sm"
            [class.btn-primary]="activeTab() === tab.key"
            [class.btn-secondary]="activeTab() !== tab.key"
            [attr.aria-selected]="activeTab() === tab.key"
            (click)="setTab(tab.key)"
          >
            <app-icon [name]="tab.icon" [size]="15" />
            {{ tab.label | transloco }}
            <span
              class="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              [class.bg-white/20]="activeTab() === tab.key"
              [class.bg-surface-3]="activeTab() !== tab.key"
              [class.text-ink-3]="activeTab() !== tab.key"
            >
              {{ tab.count }}
            </span>
          </button>
        }
      </div>

      @if (loading() && !options()) {
        <div class="card card-pad space-y-3">
          <div class="skeleton h-5 w-40"></div>
          <div class="skeleton h-10 w-full"></div>
          <div class="skeleton h-10 w-full"></div>
          <div class="skeleton h-10 w-2/3"></div>
        </div>
      } @else {
        @if (deleteBlocked()) {
          <div class="alert alert-danger mb-3">
            <app-icon name="alert" [size]="16" />
            <span>{{ 'academics.deleteBlocked' | transloco }}</span>
          </div>
        }

        <div class="card overflow-hidden">
          @switch (activeTab()) {
            @case ('programs') {
              @if (!programs().length) {
                <app-empty-state title="academics.emptyPrograms" icon="music" />
              } @else {
                <div class="table-wrap rounded-none border-0 shadow-none">
                  <table class="table table-compact">
                    <thead>
                      <tr>
                        <th>{{ 'academics.fields.name' | transloco }}</th>
                        <th>{{ 'academics.fields.code' | transloco }}</th>
                        <th>{{ 'academics.colors' | transloco }}</th>
                        <th>{{ 'common.status' | transloco }}</th>
                        @if (canWrite()) {
                          <th class="text-right">{{ 'common.actions' | transloco }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (program of programs(); track program.id) {
                        <tr>
                          <td class="font-medium text-ink">{{ program.name }}</td>
                          <td><span class="font-mono text-[12px] text-ink-3">{{ program.code }}</span></td>
                          <td>
                            <span class="flex items-center gap-2">
                              <span
                                class="h-3 w-3 rounded-full border border-line"
                                [style.background]="colorOf(program.color)"
                              ></span>
                              <span class="font-mono text-[11.5px] text-ink-3">
                                {{ colorOf(program.color) }}
                              </span>
                            </span>
                          </td>
                          <td>
                            <app-status-badge [status]="program.isActive ? 'ACTIVE' : 'INACTIVE'" />
                          </td>
                          @if (canWrite()) {
                            <td>
                              <div class="flex justify-end gap-1">
                                <button
                                  type="button"
                                  class="btn-ghost btn-icon-sm"
                                  [attr.title]="'common.edit' | transloco"
                                  (click)="openProgram(program)"
                                >
                                  <app-icon name="pencil" [size]="15" />
                                </button>
                                <button
                                  type="button"
                                  class="btn-ghost btn-icon-sm text-danger"
                                  [attr.title]="'common.delete' | transloco"
                                  (click)="remove(program.id)"
                                >
                                  <app-icon name="trash" [size]="15" />
                                </button>
                              </div>
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }

            @case ('levels') {
              @if (!levels().length) {
                <app-empty-state title="academics.emptyLevels" icon="layers" />
              } @else {
                <div class="table-wrap rounded-none border-0 shadow-none">
                  <table class="table table-compact">
                    <thead>
                      <tr>
                        <th>{{ 'academics.fields.name' | transloco }}</th>
                        <th>{{ 'academics.fields.sortOrder' | transloco }}</th>
                        <th>{{ 'common.status' | transloco }}</th>
                        @if (canWrite()) {
                          <th class="text-right">{{ 'common.actions' | transloco }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (level of levels(); track level.id) {
                        <tr>
                          <td class="font-medium text-ink">{{ level.name }}</td>
                          <td>{{ format.number(level.sortOrder) }}</td>
                          <td><app-status-badge [status]="level.isActive ? 'ACTIVE' : 'INACTIVE'" /></td>
                          @if (canWrite()) {
                            <td>
                              <div class="flex justify-end gap-1">
                                <button
                                  type="button"
                                  class="btn-ghost btn-icon-sm"
                                  [attr.title]="'common.edit' | transloco"
                                  (click)="openLevel(level)"
                                >
                                  <app-icon name="pencil" [size]="15" />
                                </button>
                                <button
                                  type="button"
                                  class="btn-ghost btn-icon-sm text-danger"
                                  [attr.title]="'common.delete' | transloco"
                                  (click)="remove(level.id)"
                                >
                                  <app-icon name="trash" [size]="15" />
                                </button>
                              </div>
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }

            @case ('years') {
              @if (!years().length) {
                <app-empty-state title="academics.emptyYears" icon="calendar" />
              } @else {
                <div class="table-wrap rounded-none border-0 shadow-none">
                  <table class="table table-compact">
                    <thead>
                      <tr>
                        <th>{{ 'academics.fields.name' | transloco }}</th>
                        <th>{{ 'academics.fields.startsOn' | transloco }} – {{ 'academics.fields.endsOn' | transloco }}</th>
                        <th>{{ 'academics.activeYear' | transloco }}</th>
                        <th>{{ 'common.status' | transloco }}</th>
                        @if (canWrite()) {
                          <th class="text-right">{{ 'common.actions' | transloco }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (year of years(); track year.id) {
                        <tr>
                          <td class="font-medium text-ink">{{ year.name }}</td>
                          <td>
                            {{
                              'academics.yearsRange'
                                | transloco: { from: format.date(year.startsOn), to: format.date(year.endsOn) }
                            }}
                          </td>
                          <td>
                            @if (year.isActive) {
                              <span class="badge badge-accent">{{ 'academics.activeYear' | transloco }}</span>
                            } @else {
                              <span class="text-ink-3">—</span>
                            }
                          </td>
                          <td><app-status-badge [status]="year.isActive ? 'ACTIVE' : 'INACTIVE'" /></td>
                          @if (canWrite()) {
                            <td>
                              <div class="flex justify-end gap-1">
                                <button
                                  type="button"
                                  class="btn-ghost btn-icon-sm"
                                  [attr.title]="'common.edit' | transloco"
                                  (click)="openYear(year)"
                                >
                                  <app-icon name="pencil" [size]="15" />
                                </button>
                                <button
                                  type="button"
                                  class="btn-ghost btn-icon-sm text-danger"
                                  [attr.title]="'common.delete' | transloco"
                                  (click)="remove(year.id)"
                                >
                                  <app-icon name="trash" [size]="15" />
                                </button>
                              </div>
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }

            @case ('branches') {
              @if (!branches().length) {
                <app-empty-state title="academics.emptyBranches" icon="building" />
              } @else {
                <div class="table-wrap rounded-none border-0 shadow-none">
                  <table class="table table-compact">
                    <thead>
                      <tr>
                        <th>{{ 'academics.fields.name' | transloco }}</th>
                        <th>{{ 'academics.fields.code' | transloco }}</th>
                        <th>{{ 'academics.fields.city' | transloco }}</th>
                        <th>{{ 'academics.fields.address' | transloco }}</th>
                        <th>{{ 'academics.fields.phone' | transloco }}</th>
                        <th>{{ 'common.status' | transloco }}</th>
                        @if (canWrite()) {
                          <th class="text-right">{{ 'common.actions' | transloco }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (branch of branches(); track branch.id) {
                        <tr>
                          <td class="font-medium text-ink">{{ branch.name }}</td>
                          <td><span class="font-mono text-[12px] text-ink-3">{{ branch.code }}</span></td>
                          <td>{{ branch.city || '—' }}</td>
                          <td class="max-w-[260px] truncate">{{ branch.address || '—' }}</td>
                          <td>{{ branch.phone || '—' }}</td>
                          <td>
                            <span class="badge" [class.badge-success]="branch.isActive" [class.badge-neutral]="!branch.isActive">
                              {{ (branch.isActive ? 'common.active' : 'common.inactive') | transloco }}
                            </span>
                          </td>
                          @if (canWrite()) {
                            <td>
                              <div class="flex justify-end gap-1">
                                <button
                                  type="button"
                                  class="btn-ghost btn-icon-sm"
                                  [attr.title]="'common.edit' | transloco"
                                  (click)="openBranch(branch)"
                                >
                                  <app-icon name="pencil" [size]="15" />
                                </button>
                                <button
                                  type="button"
                                  class="btn-ghost btn-icon-sm text-danger"
                                  [attr.title]="'common.delete' | transloco"
                                  (click)="remove(branch.id)"
                                >
                                  <app-icon name="trash" [size]="15" />
                                </button>
                              </div>
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }

            @case ('rooms') {
              @if (!rooms().length) {
                <app-empty-state title="academics.emptyRooms" icon="map-pin" />
              } @else {
                <div class="table-wrap rounded-none border-0 shadow-none">
                  <table class="table table-compact">
                    <thead>
                      <tr>
                        <th>{{ 'academics.fields.name' | transloco }}</th>
                        <th>{{ 'academics.fields.branch' | transloco }}</th>
                        <th>{{ 'academics.capacity' | transloco }}</th>
                        <th>{{ 'common.status' | transloco }}</th>
                        @if (canWrite()) {
                          <th class="text-right">{{ 'common.actions' | transloco }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (room of rooms(); track room.id) {
                        <tr>
                          <td class="font-medium text-ink">{{ room.name }}</td>
                          <td>{{ branchName(room.branchId) }}</td>
                          <td>{{ format.number(room.capacity) }}</td>
                          <td>
                            <span class="badge" [class.badge-success]="room.isActive" [class.badge-neutral]="!room.isActive">
                              {{ (room.isActive ? 'common.active' : 'common.inactive') | transloco }}
                            </span>
                          </td>
                          @if (canWrite()) {
                            <td>
                              <div class="flex justify-end gap-1">
                                <button
                                  type="button"
                                  class="btn-ghost btn-icon-sm"
                                  [attr.title]="'common.edit' | transloco"
                                  (click)="openRoom(room)"
                                >
                                  <app-icon name="pencil" [size]="15" />
                                </button>
                                <button
                                  type="button"
                                  class="btn-ghost btn-icon-sm text-danger"
                                  [attr.title]="'common.delete' | transloco"
                                  (click)="remove(room.id)"
                                >
                                  <app-icon name="trash" [size]="15" />
                                </button>
                              </div>
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
          }
        </div>
      }
    </div>

    <app-drawer
      [open]="drawerOpen()"
      [title]="drawerTitle()"
      [showFooter]="true"
      (closed)="closeDrawer()"
    >
      @if (formError()) {
        <div class="alert alert-danger mb-4">
          <app-icon name="alert" [size]="16" />
          <span>{{ formError() }}</span>
        </div>
      }

      @switch (activeTab()) {
        @case ('programs') {
          <form [formGroup]="programForm" class="space-y-4" (ngSubmit)="saveCurrent()">
            <label class="field">
              <span class="field-label">{{ 'academics.fields.name' | transloco }}</span>
              <input class="input" formControlName="name" maxlength="100" autocomplete="off" />
              @if (programForm.controls.name.touched && programForm.controls.name.invalid) {
                <span class="field-error">{{ 'common.required' | transloco }}</span>
              }
            </label>
            <label class="field">
              <span class="field-label">{{ 'academics.fields.code' | transloco }}</span>
              <input class="input font-mono" formControlName="code" maxlength="20" autocomplete="off" />
              @if (programForm.controls.code.touched && programForm.controls.code.invalid) {
                <span class="field-error">{{ 'common.required' | transloco }}</span>
              }
            </label>
            <div class="field">
              <span class="field-label">{{ 'academics.fields.color' | transloco }}</span>
              <div class="flex items-center gap-3">
                <input
                  type="color"
                  formControlName="color"
                  class="h-10 w-16 cursor-pointer rounded-lg border border-line bg-surface p-1"
                  aria-label="color"
                />
                <span class="font-mono text-[12px] text-ink-3">{{ programForm.controls.color.value }}</span>
              </div>
            </div>
            <label class="flex cursor-pointer items-center gap-2.5 text-sm text-ink-2">
              <input type="checkbox" formControlName="isActive" class="h-4 w-4 accent-[var(--accent)]" />
              {{ 'academics.fields.isActive' | transloco }}
            </label>
          </form>
        }

        @case ('levels') {
          <form [formGroup]="levelForm" class="space-y-4" (ngSubmit)="saveCurrent()">
            <label class="field">
              <span class="field-label">{{ 'academics.fields.name' | transloco }}</span>
              <input class="input" formControlName="name" maxlength="80" autocomplete="off" />
              @if (levelForm.controls.name.touched && levelForm.controls.name.invalid) {
                <span class="field-error">{{ 'common.required' | transloco }}</span>
              }
            </label>
            <label class="field">
              <span class="field-label">{{ 'academics.fields.sortOrder' | transloco }}</span>
              <input class="input" type="number" min="0" step="1" formControlName="sortOrder" />
              @if (levelForm.controls.sortOrder.touched && levelForm.controls.sortOrder.invalid) {
                <span class="field-error">{{ 'common.required' | transloco }}</span>
              }
            </label>
            <label class="flex cursor-pointer items-center gap-2.5 text-sm text-ink-2">
              <input type="checkbox" formControlName="isActive" class="h-4 w-4 accent-[var(--accent)]" />
              {{ 'academics.fields.isActive' | transloco }}
            </label>
          </form>
        }

        @case ('years') {
          <form [formGroup]="yearForm" class="space-y-4" (ngSubmit)="saveCurrent()">
            <label class="field">
              <span class="field-label">{{ 'academics.fields.name' | transloco }}</span>
              <input class="input" formControlName="name" maxlength="60" autocomplete="off" />
              @if (yearForm.controls.name.touched && yearForm.controls.name.invalid) {
                <span class="field-error">{{ 'common.required' | transloco }}</span>
              }
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="field">
                <span class="field-label">{{ 'academics.fields.startsOn' | transloco }}</span>
                <input class="input" type="date" formControlName="startsOn" />
              </label>
              <label class="field">
                <span class="field-label">{{ 'academics.fields.endsOn' | transloco }}</span>
                <input class="input" type="date" formControlName="endsOn" />
              </label>
            </div>
            <label class="flex cursor-pointer items-center gap-2.5 text-sm text-ink-2">
              <input type="checkbox" formControlName="isActive" class="h-4 w-4 accent-[var(--accent)]" />
              {{ 'academics.fields.activeYear' | transloco }}
            </label>
          </form>
        }

        @case ('branches') {
          <form [formGroup]="branchForm" class="space-y-4" (ngSubmit)="saveCurrent()">
            <label class="field">
              <span class="field-label">{{ 'academics.fields.name' | transloco }}</span>
              <input class="input" formControlName="name" maxlength="120" autocomplete="off" />
              @if (branchForm.controls.name.touched && branchForm.controls.name.invalid) {
                <span class="field-error">{{ 'common.required' | transloco }}</span>
              }
            </label>
            <label class="field">
              <span class="field-label">{{ 'academics.fields.code' | transloco }}</span>
              <input class="input font-mono" formControlName="code" maxlength="20" autocomplete="off" />
              @if (branchForm.controls.code.touched && branchForm.controls.code.invalid) {
                <span class="field-error">{{ 'common.required' | transloco }}</span>
              }
            </label>
            <label class="field">
              <span class="field-label">{{ 'academics.fields.address' | transloco }}</span>
              <input class="input" formControlName="address" maxlength="160" autocomplete="off" />
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="field">
                <span class="field-label">{{ 'academics.fields.city' | transloco }}</span>
                <input class="input" formControlName="city" maxlength="80" autocomplete="off" />
              </label>
              <label class="field">
                <span class="field-label">{{ 'academics.fields.phone' | transloco }}</span>
                <input class="input" formControlName="phone" maxlength="30" autocomplete="off" />
              </label>
            </div>
          </form>
        }

        @case ('rooms') {
          <form [formGroup]="roomForm" class="space-y-4" (ngSubmit)="saveCurrent()">
            <label class="field">
              <span class="field-label">{{ 'academics.fields.name' | transloco }}</span>
              <input class="input" formControlName="name" maxlength="80" autocomplete="off" />
              @if (roomForm.controls.name.touched && roomForm.controls.name.invalid) {
                <span class="field-error">{{ 'common.required' | transloco }}</span>
              }
            </label>
            <label class="field">
              <span class="field-label">{{ 'academics.fields.branch' | transloco }}</span>
              <select class="select" formControlName="branchId">
                <option value="">—</option>
                @for (branch of branches(); track branch.id) {
                  <option [value]="branch.id">{{ branch.name }}</option>
                }
              </select>
              @if (roomForm.controls.branchId.touched && roomForm.controls.branchId.invalid) {
                <span class="field-error">{{ 'common.required' | transloco }}</span>
              }
            </label>
            <label class="field">
              <span class="field-label">{{ 'academics.fields.capacity' | transloco }}</span>
              <input class="input" type="number" min="1" step="1" formControlName="capacity" />
            </label>
            <label class="flex cursor-pointer items-center gap-2.5 text-sm text-ink-2">
              <input type="checkbox" formControlName="isActive" class="h-4 w-4 accent-[var(--accent)]" />
              {{ 'academics.fields.isActive' | transloco }}
            </label>
          </form>
        }
      }

      <div drawer-footer class="flex items-center justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="closeDrawer()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="saveCurrent()">
          {{ (saving() ? 'common.saving' : 'common.save') | transloco }}
        </button>
      </div>
    </app-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcademicsPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  protected readonly format = inject(FormatService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly transloco = inject(TranslocoService);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly options = signal<AcademicsOptions | null>(null);
  protected readonly activeTab = signal<TabKey>('programs');
  protected readonly drawerOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly deleteBlocked = signal(false);

  protected readonly programForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    code: ['', [Validators.required, Validators.maxLength(20)]],
    color: [DEFAULT_COLOR, [Validators.required, Validators.pattern(/^#[0-9a-fA-F]{6}$/)]],
    isActive: [true],
  });

  protected readonly levelForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    sortOrder: [0, [Validators.required, Validators.min(0)]],
    isActive: [true],
  });

  protected readonly yearForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    startsOn: [todayKey(), Validators.required],
    endsOn: [addDaysKey(todayKey(), 300), Validators.required],
    isActive: [false],
  });

  protected readonly branchForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    code: ['', [Validators.required, Validators.maxLength(20)]],
    address: ['', [Validators.maxLength(160)]],
    city: ['', [Validators.maxLength(80)]],
    phone: ['', [Validators.maxLength(30)]],
  });

  protected readonly roomForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    branchId: ['', Validators.required],
    capacity: [1, [Validators.required, Validators.min(1)]],
    isActive: [true],
  });

  protected readonly programs = computed(() => this.options()?.programs ?? []);
  protected readonly levels = computed(() => this.options()?.levels ?? []);
  protected readonly years = computed(() => this.options()?.years ?? []);
  protected readonly branches = computed(() => this.options()?.branches ?? []);
  protected readonly rooms = computed(() => this.options()?.rooms ?? []);

  protected readonly tabs = computed<TabDefinition[]>(() => {
    const options = this.options();
    return [
      { key: 'programs', label: TAB_META.programs.label, icon: TAB_META.programs.icon, count: options?.programs.length ?? 0 },
      { key: 'levels', label: TAB_META.levels.label, icon: TAB_META.levels.icon, count: options?.levels.length ?? 0 },
      { key: 'years', label: TAB_META.years.label, icon: TAB_META.years.icon, count: options?.years.length ?? 0 },
      { key: 'branches', label: TAB_META.branches.label, icon: TAB_META.branches.icon, count: options?.branches.length ?? 0 },
      { key: 'rooms', label: TAB_META.rooms.label, icon: TAB_META.rooms.icon, count: options?.rooms.length ?? 0 },
    ];
  });

  protected readonly currentMeta = computed(() => TAB_META[this.activeTab()]);

  protected readonly canWrite = computed(() =>
    this.activeTab() === 'branches'
      ? this.auth.has('settings.manage')
      : this.auth.has('academics.write'),
  );

  protected readonly drawerTitle = computed(() => {
    const meta = TAB_META[this.activeTab()];
    return this.editingId() ? meta.edit : meta.add;
  });

  ngOnInit(): void {
    void this.load();
  }

  protected setTab(tab: TabKey): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.deleteBlocked.set(false);
    if (this.drawerOpen()) this.closeDrawer();
  }

  protected colorOf(color: string | null | undefined): string {
    return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_COLOR;
  }

  protected branchName(branchId: string): string {
    return this.branches().find((branch) => branch.id === branchId)?.name ?? '—';
  }

  protected openCreate(): void {
    if (!this.canWrite()) return;
    this.editingId.set(null);
    this.formError.set(null);
    const tab = this.activeTab();
    if (tab === 'programs') {
      this.programForm.reset({ name: '', code: '', color: DEFAULT_COLOR, isActive: true });
    } else if (tab === 'levels') {
      const nextOrder = this.levels().reduce((max, level) => Math.max(max, level.sortOrder), -1) + 1;
      this.levelForm.reset({ name: '', sortOrder: nextOrder, isActive: true });
    } else if (tab === 'years') {
      this.yearForm.reset({
        name: '',
        startsOn: todayKey(),
        endsOn: addDaysKey(todayKey(), 300),
        isActive: false,
      });
    } else if (tab === 'branches') {
      this.branchForm.reset({ name: '', code: '', address: '', city: '', phone: '' });
    } else {
      this.roomForm.reset({
        name: '',
        branchId: this.branches()[0]?.id ?? '',
        capacity: 1,
        isActive: true,
      });
    }
    this.drawerOpen.set(true);
  }

  protected openProgram(program: Program): void {
    this.editingId.set(program.id);
    this.programForm.reset({
      name: program.name,
      code: program.code,
      color: this.colorOf(program.color),
      isActive: program.isActive,
    });
    this.openEditDrawer();
  }

  protected openLevel(level: Level): void {
    this.editingId.set(level.id);
    this.levelForm.reset({ name: level.name, sortOrder: level.sortOrder, isActive: level.isActive });
    this.openEditDrawer();
  }

  protected openYear(year: AcademicYear): void {
    this.editingId.set(year.id);
    this.yearForm.reset({
      name: year.name,
      startsOn: year.startsOn.slice(0, 10),
      endsOn: year.endsOn.slice(0, 10),
      isActive: year.isActive,
    });
    this.openEditDrawer();
  }

  protected openBranch(branch: Branch): void {
    this.editingId.set(branch.id);
    this.branchForm.reset({
      name: branch.name,
      code: branch.code,
      address: branch.address ?? '',
      city: branch.city ?? '',
      phone: branch.phone ?? '',
    });
    this.openEditDrawer();
  }

  protected openRoom(room: Room): void {
    this.editingId.set(room.id);
    this.roomForm.reset({
      name: room.name,
      branchId: room.branchId,
      capacity: room.capacity,
      isActive: room.isActive,
    });
    this.openEditDrawer();
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
    this.editingId.set(null);
    this.formError.set(null);
  }

  protected async saveCurrent(): Promise<void> {
    const tab = this.activeTab();
    this.formError.set(null);

    const form = this.formFor(tab);
    let body: Record<string, unknown>;

    if (tab === 'programs') {
      const value = this.programForm.getRawValue();
      body = {
        name: value.name.trim(),
        code: value.code.trim(),
        color: value.color,
        isActive: value.isActive,
      };
    } else if (tab === 'levels') {
      const value = this.levelForm.getRawValue();
      body = { name: value.name.trim(), sortOrder: Number(value.sortOrder), isActive: value.isActive };
    } else if (tab === 'years') {
      const value = this.yearForm.getRawValue();
      body = {
        name: value.name.trim(),
        startsOn: value.startsOn,
        endsOn: value.endsOn,
        isActive: value.isActive,
      };
    } else if (tab === 'branches') {
      const value = this.branchForm.getRawValue();
      body = {
        name: value.name.trim(),
        code: value.code.trim(),
        address: value.address.trim() || null,
        city: value.city.trim() || null,
        phone: value.phone.trim() || null,
      };
    } else {
      const value = this.roomForm.getRawValue();
      body = {
        name: value.name.trim(),
        branchId: value.branchId,
        capacity: Number(value.capacity),
        isActive: value.isActive,
      };
    }

    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const id = this.editingId();
      const endpoint = this.endpoint(tab);
      if (id) {
        await firstValueFrom(this.api.patch(endpoint + '/' + id, body));
      } else {
        await firstValueFrom(this.api.post(endpoint, body));
      }
      this.toast.success(this.transloco.translate(id ? 'academics.saved' : 'academics.created'));
      this.closeDrawer();
      await this.load();
    } catch (error) {
      this.formError.set(this.errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(id: string): Promise<void> {
    this.deleteBlocked.set(false);
    const confirmed = await this.confirm.confirm({
      title: this.transloco.translate('academics.deleteTitle'),
      message: this.transloco.translate('academics.deleteMessage'),
      confirmLabel: this.transloco.translate('common.delete'),
      cancelLabel: this.transloco.translate('common.cancel'),
      danger: true,
    });
    if (!confirmed) return;

    try {
      await firstValueFrom(this.api.delete(this.endpoint(this.activeTab()) + '/' + id));
      this.toast.success(this.transloco.translate('common.deleted'));
      await this.load();
    } catch {
      this.deleteBlocked.set(true);
    }
  }

  private openEditDrawer(): void {
    if (!this.canWrite()) return;
    this.formError.set(null);
    this.drawerOpen.set(true);
  }

  private formFor(tab: TabKey) {
    if (tab === 'programs') return this.programForm;
    if (tab === 'levels') return this.levelForm;
    if (tab === 'years') return this.yearForm;
    if (tab === 'branches') return this.branchForm;
    return this.roomForm;
  }

  private endpoint(tab: TabKey): string {
    switch (tab) {
      case 'programs':
        return '/academics/programs';
      case 'levels':
        return '/academics/levels';
      case 'years':
        return '/academics/academic-years';
      case 'branches':
        return '/tenant/branches';
      case 'rooms':
        return '/academics/rooms';
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = (error.error as { message?: string | string[] } | null)?.message;
      if (Array.isArray(message) && message.length) return message.join(' · ');
      if (typeof message === 'string' && message.trim()) return message;
    }
    return this.transloco.translate('common.error');
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const options = await firstValueFrom(this.api.get<AcademicsOptions>('/academics/options'));
      this.options.set(options);
    } catch {
      // Errors are surfaced globally by the HTTP interceptor.
    } finally {
      this.loading.set(false);
    }
  }
}
