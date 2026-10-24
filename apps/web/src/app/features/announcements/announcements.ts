import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { FormatService } from '../../core/format.service';
import type { Announcement, Branch, Role } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

const AUDIENCE_ROLES: Role[] = ['STUDENT', 'GUARDIAN', 'TEACHER', 'ADMINISTRATOR', 'DIRECTOR'];

@Component({
  selector: 'app-announcements',
  imports: [SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="announcements.title" subtitle="announcements.subtitle" eyebrow="nav.community">
        @if (canWrite()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <app-icon name="plus" [size]="15" />
            {{ 'announcements.new' | transloco }}
          </button>
        }
      </app-page-header>

      @if (loading()) {
        <div class="grid gap-4">
          @for (item of skeletons; track item) {
            <div class="skeleton h-40 rounded-2xl"></div>
          }
        </div>
      } @else if (announcements().length === 0) {
        <div class="card">
          <app-empty-state
            title="announcements.empty"
            message="announcements.emptyHint"
            icon="megaphone"
          >
            @if (canWrite()) {
              <button type="button" class="btn btn-primary" (click)="openCreate()">
                <app-icon name="plus" [size]="15" />
                {{ 'announcements.new' | transloco }}
              </button>
            }
          </app-empty-state>
        </div>
      } @else {
        <div class="grid gap-4">
          @for (announcement of announcements(); track announcement.id) {
            <article class="card relative overflow-hidden" [class.border-accent]="announcement.isPinned">
              @if (announcement.isPinned) {
                <span class="absolute inset-x-0 top-0 h-[3px] bg-accent"></span>
              }
              <div class="card-pad">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      @if (announcement.isPinned) {
                        <app-icon name="pin" [size]="14" class="text-accent" />
                      }
                      <h2 class="text-[16px] font-semibold leading-snug tracking-tight">
                        {{ announcement.title }}
                      </h2>
                      @if (announcement.isPinned) {
                        <span class="badge badge-accent">{{ 'announcements.pinned' | transloco }}</span>
                      }
                    </div>
                  </div>

                  @if (canWrite()) {
                    <div class="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        class="btn btn-ghost btn-icon-sm"
                        [class.text-accent]="announcement.isPinned"
                        [disabled]="busyId() === announcement.id"
                        [attr.aria-label]="(announcement.isPinned ? 'announcements.unpin' : 'announcements.pin') | transloco"
                        [attr.title]="(announcement.isPinned ? 'announcements.unpin' : 'announcements.pin') | transloco"
                        (click)="togglePin(announcement)"
                      >
                        <app-icon name="pin" [size]="15" />
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-icon-sm"
                        [attr.aria-label]="'common.edit' | transloco"
                        [attr.title]="'common.edit' | transloco"
                        (click)="openEdit(announcement)"
                      >
                        <app-icon name="pencil" [size]="15" />
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-icon-sm text-danger hover:bg-danger-soft hover:text-danger"
                        [attr.aria-label]="'common.delete' | transloco"
                        [attr.title]="'common.delete' | transloco"
                        (click)="remove(announcement)"
                      >
                        <app-icon name="trash" [size]="15" />
                      </button>
                    </div>
                  }
                </div>

                <p
                  class="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2"
                  [class.line-clamp-3]="!isExpanded(announcement.id)"
                >
                  {{ announcement.body }}
                </p>
                @if (needsExpansion(announcement.body)) {
                  <button
                    type="button"
                    class="mt-1.5 text-[12px] font-semibold text-accent-strong hover:underline"
                    (click)="toggleExpanded(announcement.id)"
                  >
                    {{ (isExpanded(announcement.id) ? 'announcements.showLess' : 'announcements.readMore') | transloco }}
                  </button>
                }

                <div
                  class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3 text-[11.5px] text-ink-3"
                >
                  @if (authorName(announcement); as author) {
                    <span class="inline-flex items-center gap-1.5">
                      <app-icon name="user" [size]="13" />
                      {{ 'announcements.author' | transloco: { name: author } }}
                    </span>
                    <span class="text-line-strong">·</span>
                  }
                  <span>{{ format.timeAgo(announcement.publishedAt) }}</span>
                  @if (announcement.branch?.name; as branchName) {
                    <span class="text-line-strong">·</span>
                    <span class="inline-flex items-center gap-1.5">
                      <app-icon name="building" [size]="13" />
                      {{ branchName }}
                    </span>
                  }
                  <span class="ml-auto flex flex-wrap items-center gap-1.5">
                    @if (announcement.audienceRoles.length === 0) {
                      <span class="badge badge-neutral">{{ 'announcements.audiences.ALL' | transloco }}</span>
                    } @else {
                      @for (role of announcement.audienceRoles; track role) {
                        <span class="badge badge-neutral">
                          {{ ('announcements.audiences.' + role) | transloco }}
                        </span>
                      }
                    }
                  </span>
                </div>
              </div>
            </article>
          }
        </div>

        <app-pagination
          [page]="page()"
          [pageSize]="pageSize"
          [total]="total()"
          (pageChange)="goToPage($event)"
        />
      }
    </div>

    <app-drawer
      [open]="drawerOpen()"
      [title]="editing() ? 'announcements.editTitle' : 'announcements.createTitle'"
      [showFooter]="true"
      size="lg"
      (closed)="closeComposer()"
    >
      <form [formGroup]="form" class="space-y-4" (ngSubmit)="save()">
        <div class="field">
          <label class="field-label" for="announcement-title">{{ 'announcements.form.title' | transloco }}</label>
          <input
            id="announcement-title"
            type="text"
            class="input"
            formControlName="title"
            [placeholder]="'announcements.form.titlePlaceholder' | transloco"
            maxlength="160"
          />
          @if (form.controls.title.touched && form.controls.title.hasError('required')) {
            <p class="field-error">{{ 'common.required' | transloco }}</p>
          }
        </div>

        <div class="field">
          <label class="field-label" for="announcement-body">{{ 'announcements.form.body' | transloco }}</label>
          <textarea
            id="announcement-body"
            class="textarea min-h-40"
            formControlName="body"
            [placeholder]="'announcements.form.bodyPlaceholder' | transloco"
            maxlength="5000"
          ></textarea>
          @if (form.controls.body.touched && form.controls.body.hasError('required')) {
            <p class="field-error">{{ 'common.required' | transloco }}</p>
          }
        </div>

        <div class="field">
          <span class="field-label">{{ 'announcements.form.audience' | transloco }}</span>
          <div class="grid gap-2 sm:grid-cols-2">
            @for (role of audienceRoles; track role) {
              <label
                class="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2 transition-colors hover:border-line-strong"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-line text-accent focus:ring-accent/30"
                  [checked]="hasAudience(role)"
                  (change)="onAudienceChange(role, $event)"
                />
                {{ ('announcements.audiences.' + role) | transloco }}
              </label>
            }
          </div>
          @if (form.controls.audienceRoles.value.length === 0) {
            <p class="field-hint">{{ 'announcements.form.allAudiences' | transloco }}</p>
          }
        </div>

        @if (canReadBranches()) {
          <div class="field">
            <label class="field-label" for="announcement-branch">{{ 'announcements.form.branch' | transloco }}</label>
            <select id="announcement-branch" class="select" formControlName="branchId">
              <option value="">{{ 'announcements.form.allBranches' | transloco }}</option>
              @for (branch of branches(); track branch.id) {
                <option [value]="branch.id">{{ branch.name }}</option>
              }
            </select>
          </div>
        }

        <label
          class="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[13px] font-medium text-ink-2"
        >
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-line text-accent focus:ring-accent/30"
            formControlName="isPinned"
          />
          <app-icon name="pin" [size]="14" />
          {{ 'announcements.form.pinned' | transloco }}
        </label>
      </form>

      <div drawer-footer class="flex items-center justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="closeComposer()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          [disabled]="saving() || form.invalid"
          (click)="save()"
        >
          {{ (saving() ? 'common.saving' : editing() ? 'common.save' : 'common.create') | transloco }}
        </button>
      </div>
    </app-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnnouncementsPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly transloco = inject(TranslocoService);
  readonly format = inject(FormatService);

  readonly audienceRoles = AUDIENCE_ROLES;
  readonly skeletons = [1, 2, 3];
  readonly pageSize = 10;

  readonly announcements = signal<Announcement[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly drawerOpen = signal(false);
  readonly editing = signal<Announcement | null>(null);
  readonly branches = signal<Branch[]>([]);
  readonly busyId = signal<string | null>(null);
  readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  readonly canWrite = computed(() => this.auth.has('announcements.write'));
  readonly canReadBranches = computed(() => this.auth.has('academics.read'));

  readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    body: ['', [Validators.required, Validators.maxLength(5000)]],
    audienceRoles: this.fb.control<Role[]>([]),
    branchId: [''],
    isPinned: [false],
  });

  constructor() {
    void this.load();
    if (this.canReadBranches()) void this.loadBranches();
  }

  goToPage(page: number): void {
    this.page.set(page);
    void this.load();
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  needsExpansion(body: string): boolean {
    return body.length > 260 || body.includes('\n');
  }

  toggleExpanded(id: string): void {
    const next = new Set(this.expandedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expandedIds.set(next);
  }

  authorName(announcement: Announcement): string {
    const author = announcement.author;
    return author ? `${author.firstName} ${author.lastName}`.trim() : '';
  }

  hasAudience(role: Role): boolean {
    return this.form.controls.audienceRoles.value.includes(role);
  }

  onAudienceChange(role: Role, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.form.controls.audienceRoles.value;
    const next = checked
      ? [...current.filter((value) => value !== role), role]
      : current.filter((value) => value !== role);
    this.form.controls.audienceRoles.setValue(next);
    this.form.controls.audienceRoles.markAsDirty();
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({
      title: '',
      body: '',
      audienceRoles: [],
      branchId: '',
      isPinned: false,
    });
    this.drawerOpen.set(true);
  }

  openEdit(announcement: Announcement): void {
    this.editing.set(announcement);
    this.form.reset({
      title: announcement.title,
      body: announcement.body,
      audienceRoles: [...announcement.audienceRoles],
      branchId: announcement.branchId ?? '',
      isPinned: announcement.isPinned,
    });
    this.drawerOpen.set(true);
  }

  closeComposer(): void {
    this.drawerOpen.set(false);
    this.editing.set(null);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const payload = {
      title: value.title.trim(),
      body: value.body.trim(),
      audienceRoles: value.audienceRoles,
      branchId: this.canReadBranches()
        ? value.branchId || null
        : (this.editing()?.branchId ?? null),
      isPinned: value.isPinned,
    };
    try {
      const editing = this.editing();
      if (editing) {
        await firstValueFrom(this.api.patch<Announcement>(`/announcements/${editing.id}`, payload));
        this.toast.success(this.transloco.translate('announcements.form.saved'));
      } else {
        await firstValueFrom(this.api.post<Announcement>('/announcements', payload));
        this.toast.success(this.transloco.translate('announcements.form.created'));
        this.page.set(1);
      }
      this.closeComposer();
      await this.load();
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.saving.set(false);
    }
  }

  async togglePin(announcement: Announcement): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(announcement.id);
    try {
      await firstValueFrom(
        this.api.patch<Announcement>(`/announcements/${announcement.id}`, {
          isPinned: !announcement.isPinned,
        }),
      );
      await this.load();
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.busyId.set(null);
    }
  }

  async remove(announcement: Announcement): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.transloco.translate('announcements.deleteTitle'),
      message: this.transloco.translate('announcements.deleteMessage'),
      confirmLabel: this.transloco.translate('common.delete'),
      cancelLabel: this.transloco.translate('common.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await firstValueFrom(this.api.delete<{ success: boolean }>(`/announcements/${announcement.id}`));
      this.toast.success(this.transloco.translate('common.deleted'));
      if (this.announcements().length === 1 && this.page() > 1) {
        this.page.update((page) => page - 1);
      }
      await this.load();
    } catch {
      // Errors surface through the global interceptor.
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(
        this.api.list<Announcement>('/announcements', {
          page: this.page(),
          pageSize: this.pageSize,
        }),
      );
      this.announcements.set(response.data);
      this.total.set(response.meta?.total ?? response.data.length);
    } catch {
      this.announcements.set([]);
      this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadBranches(): Promise<void> {
    try {
      const branches = await firstValueFrom(this.api.get<Branch[]>('/tenant/branches'));
      this.branches.set(branches);
    } catch {
      this.branches.set([]);
    }
  }
}
