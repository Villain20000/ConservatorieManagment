import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from './icon';

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const ICON_TONES: Record<Tone, string> = {
  default: 'border-line bg-surface-2 text-ink-2',
  accent: 'border-accent/20 bg-accent-soft text-accent-strong',
  success: 'border-success/20 bg-success-soft text-success',
  warning: 'border-warning/20 bg-warning-soft text-warning',
  danger: 'border-danger/20 bg-danger-soft text-danger',
  info: 'border-info/20 bg-info-soft text-info',
};

@Component({
  selector: 'app-stat-card',
  imports: [TranslocoPipe, IconComponent],
  template: `
    <div class="card group relative overflow-hidden p-5">
      <div class="flex items-start justify-between gap-3">
        <p class="text-[12px] font-medium text-ink-3">{{ label() | transloco }}</p>
        @if (icon()) {
          <span
            class="flex h-8 w-8 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105"
            [class]="iconTone()"
          >
            <app-icon [name]="icon()!" [size]="15" />
          </span>
        }
      </div>
      <p class="mt-2.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums">
        {{ value() }}
      </p>
      <div class="mt-2 flex items-center gap-2">
        @if (trend(); as trendValue) {
          <span
            class="inline-flex items-center gap-0.5 text-[11.5px] font-semibold"
            [class.text-success]="!trendValue.startsWith('-')"
            [class.text-danger]="trendValue.startsWith('-')"
          >
            <app-icon
              [name]="trendValue.startsWith('-') ? 'trending-down' : 'trending-up'"
              [size]="13"
            />
            {{ trendValue }}
          </span>
        }
        @if (hint()) {
          <p class="text-[11.5px] leading-snug text-ink-3">{{ hint() }}</p>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>();
  readonly icon = input<string>();
  readonly tone = input<Tone>('default');
  readonly trend = input<string>();

  iconTone(): string {
    return ICON_TONES[this.tone()];
  }
}
