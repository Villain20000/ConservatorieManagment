import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Toast, ToastService } from '../../core/toast.service';
import { IconComponent } from './icon';

@Component({
  selector: 'app-toast-host',
  imports: [IconComponent],
  template: `
    <div
      class="pointer-events-none fixed bottom-5 right-4 z-[120] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:right-6"
      aria-live="polite"
      aria-atomic="false"
    >
      @for (toast of toasts(); track toast.id) {
        <div
          class="animate-scale-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface p-3.5 shadow-pop"
          [class]="borderFor(toast)"
          role="status"
        >
          <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" [class]="iconWrapFor(toast)">
            <app-icon [name]="iconFor(toast)" [size]="15" />
          </span>
          <div class="min-w-0 flex-1 pt-0.5">
            @if (toast.title) {
              <p class="text-[12.5px] font-semibold text-ink">{{ toast.title }}</p>
            }
            <p class="text-[12.5px] leading-relaxed text-ink-2">{{ toast.message }}</p>
          </div>
          <button
            type="button"
            class="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-3 hover:text-ink"
            (click)="dismiss(toast)"
            aria-label="Κλείσιμο"
          >
            <app-icon name="x" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  private readonly service = inject(ToastService);
  readonly toasts = this.service.toasts;

  dismiss(toast: Toast): void {
    this.service.dismiss(toast.id);
  }

  borderFor(toast: Toast): string {
    if (toast.type === 'error') return 'border-danger/30';
    if (toast.type === 'success') return 'border-success/25';
    return 'border-line';
  }

  iconWrapFor(toast: Toast): string {
    if (toast.type === 'error') return 'bg-danger-soft text-danger';
    if (toast.type === 'success') return 'bg-success-soft text-success';
    return 'bg-info-soft text-info';
  }

  iconFor(toast: Toast): string {
    if (toast.type === 'error') return 'alert';
    if (toast.type === 'success') return 'check-circle';
    return 'info';
  }
}
