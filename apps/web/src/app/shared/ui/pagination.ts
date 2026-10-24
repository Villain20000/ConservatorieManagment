import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from './icon';

@Component({
  selector: 'app-pagination',
  imports: [TranslocoPipe, IconComponent],
  template: `
    @if (total() > 0) {
      <div class="flex flex-wrap items-center justify-between gap-3 px-1 py-3">
        <p class="text-[12px] text-ink-3">
          {{ 'pagination.range' | transloco: { from: from(), to: to(), total: total() } }}
        </p>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="btn-secondary btn-icon-sm"
            [disabled]="page() <= 1"
            (click)="go(page() - 1)"
            [attr.aria-label]="'pagination.previous' | transloco"
          >
            <app-icon name="chevron-left" [size]="15" />
          </button>
          <span class="min-w-16 text-center text-[12px] font-medium tabular-nums text-ink-2">
            {{ page() }} / {{ totalPages() }}
          </span>
          <button
            type="button"
            class="btn-secondary btn-icon-sm"
            [disabled]="page() >= totalPages()"
            (click)="go(page() + 1)"
            [attr.aria-label]="'pagination.next' | transloco"
          >
            <app-icon name="chevron-right" [size]="15" />
          </button>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly pageChange = output<number>();

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly from = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1,
  );
  readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));

  go(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.pageChange.emit(page);
  }
}
