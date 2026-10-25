import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { FormatService } from '../../core/format.service';
import { ToastService } from '../../core/toast.service';
import { TrashService } from '../../core/trash.service';
import type { TrashEntity, TrashRow } from '../../core/trash.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

interface TrashTab {
  id: TrashEntity;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-deleted-items',
  imports: [SHARED_IMPORTS],
  template: `
    <div class="space-y-4">
      <div>
        <h2 class="text-[15px] font-semibold">{{ 'trash.title' | transloco }}</h2>
        <p class="mt-0.5 text-[12px] text-ink-3">{{ 'trash.subtitle' | transloco }}</p>
      </div>

      <div class="overflow-x-auto">
        <nav
          class="inline-flex min-w-full gap-1 rounded-xl border border-line bg-surface p-1 sm:min-w-0"
          role="tablist"
          [attr.aria-label]="'trash.title' | transloco"
        >
          @for (item of tabs; track item.id; let index = $index) {
            <button
              #tabBtn
              type="button"
              role="tab"
              class="flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
              [id]="'trash-tab-' + item.id"
              [attr.aria-selected]="entity() === item.id"
              [attr.aria-controls]="'trash-panel'"
              [attr.tabindex]="entity() === item.id ? 0 : -1"
              [class.bg-accent-soft]="entity() === item.id"
              [class.text-accent-strong]="entity() === item.id"
              (click)="selectTab(item.id)"
              (keydown)="onTabKeydown($event, index)"
            >
              <app-icon [name]="item.icon" [size]="15" />
              {{ item.label | transloco }}
            </button>
          }
        </nav>
      </div>

      <div
        id="trash-panel"
        role="tabpanel"
        class="space-y-3"
        [attr.aria-labelledby]="'trash-tab-' + entity()"
      >
        @if (loading()) {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">{{ 'common.name' | transloco }}</th>
                  <th scope="col" class="w-44">{{ 'trash.deletedAt' | transloco }}</th>
                  <th scope="col" class="w-40">{{ 'trash.deletedBy' | transloco }}</th>
                  <th scope="col" class="w-32">{{ 'common.actions' | transloco }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of skeletonRows; track row) {
                  <tr>
                    <td><div class="skeleton h-3.5 w-40"></div></td>
                    <td><div class="skeleton h-3.5 w-28"></div></td>
                    <td><div class="skeleton h-3.5 w-24"></div></td>
                    <td><div class="skeleton h-8 w-24 rounded-lg"></div></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (error()) {
          <div class="card card-pad">
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
        } @else if (rows().length === 0) {
          <div class="card">
            <app-empty-state title="trash.empty" icon="trash" />
          </div>
        } @else {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">{{ 'common.name' | transloco }}</th>
                  <th scope="col" class="w-44">{{ 'trash.deletedAt' | transloco }}</th>
                  <th scope="col" class="w-40">{{ 'trash.deletedBy' | transloco }}</th>
                  <th scope="col" class="w-32">{{ 'common.actions' | transloco }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.id) {
                  <tr>
                    <td class="font-medium text-ink">{{ row.label }}</td>
                    <td class="whitespace-nowrap tabular-nums">{{ format.dateTime(row.deletedAt) }}</td>
                    <td class="truncate">{{ row.deletedBy ?? ('common.unknown' | transloco) }}</td>
                    <td>
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        [disabled]="restoringId() !== null"
                        [attr.aria-busy]="restoringId() === row.id"
                        (click)="restore(row)"
                      >
                        <app-icon name="refresh" [size]="14" />
                        {{ 'trash.restore' | transloco }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <app-pagination
            [page]="page()"
            [pageSize]="pageSize"
            [total]="total()"
            (pageChange)="goToPage($event)"
          />
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeletedItemsComponent {
  private readonly trash = inject(TrashService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  readonly format = inject(FormatService);

  readonly tabs: TrashTab[] = [
    { id: 'students', label: 'trash.students', icon: 'graduation' },
    { id: 'teachers', label: 'trash.teachers', icon: 'user-check' },
    { id: 'documents', label: 'trash.documents', icon: 'file-text' },
    { id: 'lessonSeries', label: 'trash.series', icon: 'calendar' },
    { id: 'announcements', label: 'trash.announcements', icon: 'megaphone' },
  ];

  readonly pageSize = 10;
  readonly skeletonRows = [1, 2, 3, 4, 5];

  readonly entity = signal<TrashEntity>('students');
  readonly rows = signal<TrashRow[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly restoringId = signal<string | null>(null);

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');
  private requestId = 0;

  constructor() {
    void this.load();
  }

  selectTab(entity: TrashEntity): void {
    if (this.entity() === entity) return;
    this.entity.set(entity);
    this.page.set(1);
    this.rows.set([]);
    this.total.set(0);
    this.error.set(false);
    void this.load();
  }

  onTabKeydown(event: KeyboardEvent, index: number): void {
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % this.tabs.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + this.tabs.length) % this.tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = this.tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.selectTab(this.tabs[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  goToPage(page: number): void {
    if (page === this.page()) return;
    this.page.set(page);
    void this.load();
  }

  reload(): void {
    void this.load();
  }

  async restore(row: TrashRow): Promise<void> {
    if (this.restoringId()) return;
    this.restoringId.set(row.id);
    try {
      await this.trash.restore(this.entity(), row.id);
      this.rows.update((rows) => rows.filter((item) => item.id !== row.id));
      this.total.update((total) => Math.max(0, total - 1));
      this.toast.success(this.transloco.translate('trash.restored'));
      if (this.rows().length === 0 && this.page() > 1) {
        this.page.update((page) => page - 1);
        await this.load();
      }
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.restoringId.set(null);
    }
  }

  private async load(): Promise<void> {
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.error.set(false);
    try {
      const { data, meta } = await this.trash.list(this.entity(), this.page(), this.pageSize);
      if (requestId !== this.requestId) return;
      this.rows.set(data);
      this.total.set(meta.total);
    } catch {
      if (requestId !== this.requestId) return;
      this.rows.set([]);
      this.total.set(0);
      this.error.set(true);
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }
}
