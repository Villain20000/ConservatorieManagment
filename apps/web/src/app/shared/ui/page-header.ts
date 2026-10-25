import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-page-header',
  imports: [TranslocoPipe],
  template: `
    <header class="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div class="min-w-0">
        @if (eyebrow()) {
          <p class="eyebrow mb-1.5">{{ eyebrow() | transloco }}</p>
        }
        <h1 class="text-[26px] font-semibold leading-tight tracking-[-0.025em] sm:text-[30px]">
          {{ translateTitle() ? (title() | transloco) : title() }}
        </h1>
        @if (subtitle()) {
          <p class="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
            {{ subtitle() | transloco }}
          </p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ng-content />
      </div>
    </header>
  `,
  host: { '[attr.title]': 'null' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly eyebrow = input<string>();
  readonly translateTitle = input(true);
}
