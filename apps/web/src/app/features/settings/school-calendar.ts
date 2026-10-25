import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import type { CalendarDay, CalendarDayKind } from '../../core/calendar';
import { ConfirmService } from '../../core/confirm.service';
import { FormatService } from '../../core/format.service';
import type { Branch } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

const KIND_LABEL: Record<CalendarDayKind, string> = {
  HOLIDAY: 'calendar.kind.HOLIDAY',
  CLOSED: 'calendar.kind.CLOSED',
  MAKEUP_DAY: 'calendar.kind.MAKEUP_DAY',
};

/**
 * School calendar of dated exceptions. These rules are what the scheduling
 * engine actually honours when it materialises a weekly series, so the list is
 * shown with the same wording the teacher will see in an explanation.
 */
@Component({
  selector: 'app-school-calendar',
  imports: [SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <section class="card">
      <div class="card-head flex-wrap gap-3">
        <div class="min-w-0">
          <h2 class="text-[15px] font-semibold">{{ 'calendar.title' | transloco }}</h2>
          <p class="mt-0.5 text-[12px] text-ink-3">{{ 'calendar.subtitle' | transloco }}</p>
        </div>
        @if (auth.has('schedule.write')) {
          <button type="button" class="btn btn-secondary btn-sm" (click)="toggleForm()">
            <app-icon [name]="formOpen() ? 'close' : 'plus'" [size]="14" />
            {{ (formOpen() ? 'common.cancel' : 'calendar.add') | transloco }}
          </button>
        }
      </div>

      @if (formOpen() && auth.has('schedule.write')) {
        <form class="card-pad grid gap-3 border-b border-line sm:grid-cols-2" [formGroup]="form" (ngSubmit)="submit()">
          <label class="field">
            <span class="field-label">{{ 'calendar.date' | transloco }}</span>
            <input name="date" class="input" type="date" formControlName="date" autocomplete="off" />
            @if (form.controls.date.touched && form.controls.date.invalid) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'calendar.type' | transloco }}</span>
            <select name="kind" class="select" formControlName="kind">
              @for (kind of kinds; track kind) {
                <option [value]="kind">{{ kindLabel(kind) }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ 'calendar.name' | transloco }}</span>
            <input
              name="name"
              class="input"
              type="text"
              maxlength="120"
              autocomplete="off"
              formControlName="name"
            />
            @if (form.controls.name.touched && form.controls.name.invalid) {
              <span class="field-error">{{ 'common.required' | transloco }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">{{ 'calendar.branch' | transloco }}</span>
            <select name="branchId" class="select" formControlName="branchId">
              <option value="">{{ 'calendar.allBranches' | transloco }}</option>
              @for (branch of branches(); track branch.id) {
                <option [value]="branch.id">{{ branch.name }}</option>
              }
            </select>
          </label>
          <div class="flex items-end justify-end sm:col-span-2">
            <button type="submit" class="btn btn-primary" [disabled]="saving() || form.invalid">
              {{ (saving() ? 'common.saving' : 'common.save') | transloco }}
            </button>
          </div>
        </form>
      }

      @if (loading()) {
        <div class="card-pad space-y-2">
          @for (row of skeleton; track row) {
            <div class="skeleton h-9 w-full"></div>
          }
        </div>
      } @else if (error()) {
        <div class="card-pad">
          <div class="alert alert-danger">
            <app-icon name="alert" [size]="18" class="mt-0.5 shrink-0" />
            <div class="flex-1">
              <p class="font-semibold">{{ 'common.error' | transloco }}</p>
              <button type="button" class="btn btn-secondary btn-sm mt-3" (click)="reload()">
                <app-icon name="refresh" [size]="14" />
                {{ 'common.retry' | transloco }}
              </button>
            </div>
          </div>
        </div>
      } @else if (days().length === 0) {
        <app-empty-state title="calendar.empty" message="calendar.emptyHint" icon="calendar" />
      } @else {
        <div class="table-wrap">
          <table class="table">
            <caption class="sr-only">{{ 'calendar.title' | transloco }}</caption>
            <thead>
              <tr>
                <th scope="col" class="w-36">{{ 'calendar.date' | transloco }}</th>
                <th scope="col">{{ 'calendar.name' | transloco }}</th>
                <th scope="col" class="w-40">{{ 'calendar.type' | transloco }}</th>
                <th scope="col" class="w-44">{{ 'calendar.branch' | transloco }}</th>
                @if (auth.has('schedule.write')) {
                  <th scope="col" class="w-20"><span class="sr-only">{{ 'common.actions' | transloco }}</span></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (day of days(); track day.id) {
                <tr>
                  <td class="tabular-nums">{{ format.date(day.date) }}</td>
                  <td class="font-medium text-ink">{{ day.name }}</td>
                  <td>
                    <span class="badge" [class]="day.kind === 'MAKEUP_DAY' ? 'badge-success' : 'badge-neutral'">
                      {{ kindLabel(day.kind) }}
                    </span>
                  </td>
                  <td class="text-ink-2">{{ day.branch?.name ?? ('calendar.allBranches' | transloco) }}</td>
                  @if (auth.has('schedule.write')) {
                    <td class="text-right">
                      <button
                        type="button"
                        class="btn btn-ghost btn-icon-sm text-danger"
                        [attr.aria-label]="'calendar.remove' | transloco"
                        [disabled]="deletingId() === day.id"
                        (click)="remove(day)"
                      >
                        <app-icon name="trash" [size]="14" />
                      </button>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchoolCalendarComponent {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly transloco = inject(TranslocoService);
  readonly auth = inject(AuthService);
  readonly format = inject(FormatService);

  /** Branches shown in the form; the parent page already loads them. */
  readonly branches = input<Branch[]>([]);
  /** Restricts the list to one branch (tenant-wide rules stay visible). */
  readonly branchFilter = signal<string>('');

  readonly days = signal<CalendarDay[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly saving = signal(false);
  readonly deletingId = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly kinds: CalendarDayKind[] = ['HOLIDAY', 'CLOSED', 'MAKEUP_DAY'];
  readonly skeleton = [0, 1, 2];

  readonly form = this.fb.group({
    date: ['', Validators.required],
    kind: ['HOLIDAY' as CalendarDayKind, Validators.required],
    name: ['', [Validators.required, Validators.minLength(2)]],
    branchId: [''],
  });

  readonly count = computed(() => this.days().length);

  constructor() {
    void this.reload();
  }

  kindLabel(kind: CalendarDayKind): string {
    return this.transloco.translate(KIND_LABEL[kind]);
  }

  toggleForm(): void {
    this.formOpen.update((open) => !open);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    try {
      await firstValueFrom(
        this.api.post('/schedule/calendar', {
          date: raw.date,
          kind: raw.kind,
          name: raw.name.trim(),
          branchId: raw.branchId || null,
        }),
      );
      this.toast.success(this.transloco.translate('calendar.created'));
      this.form.reset({ date: '', kind: 'HOLIDAY', name: '', branchId: '' });
      this.formOpen.set(false);
      await this.reload();
    } catch {
      this.toast.error(this.transloco.translate('common.error'));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(day: CalendarDay): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.transloco.translate('calendar.remove'),
      message: this.transloco.translate('calendar.removeHint', { name: day.name }),
      danger: true,
      confirmLabel: this.transloco.translate('common.delete'),
    });
    if (!confirmed) return;
    this.deletingId.set(day.id);
    try {
      await firstValueFrom(this.api.delete(`/schedule/calendar/${day.id}`));
      this.days.update((rows) => rows.filter((row) => row.id !== day.id));
      this.toast.success(this.transloco.translate('calendar.removed'));
    } catch {
      this.toast.error(this.transloco.translate('common.error'));
    } finally {
      this.deletingId.set(null);
    }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const branchId = this.branchFilter();
      const response = await firstValueFrom(
        this.api.get<{ data: CalendarDay[] }>(
          '/schedule/calendar',
          branchId ? { branchId } : undefined,
        ),
      );
      this.days.set(response.data ?? []);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
