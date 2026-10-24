import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from './icon';

@Component({
  selector: 'app-empty-state',
  imports: [TranslocoPipe, IconComponent],
  template: `
    <div class="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div
        class="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface-2 text-ink-3"
      >
        <app-icon [name]="icon()" [size]="22" />
      </div>
      <p class="mt-4 text-sm font-semibold text-ink">{{ title() | transloco }}</p>
      @if (message()) {
        <p class="mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-3">
          {{ message() | transloco }}
        </p>
      }
      <div class="mt-4 empty:hidden"><ng-content /></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly message = input<string>();
  readonly icon = input('info');
}
