import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-progress',
  template: `
    <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div
        class="h-full rounded-full transition-[width] duration-500"
        [class]="barClass()"
        [style.width.%]="clamped()"
      ></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressComponent {
  readonly value = input.required<number>();
  readonly tone = input<'accent' | 'success' | 'warning' | 'danger'>('accent');

  readonly clamped = computed(() => Math.min(100, Math.max(0, this.value())));
  readonly barClass = computed(() => {
    switch (this.tone()) {
      case 'success':
        return 'bg-success';
      case 'warning':
        return 'bg-warning';
      case 'danger':
        return 'bg-danger';
      default:
        return 'bg-accent';
    }
  });
}
