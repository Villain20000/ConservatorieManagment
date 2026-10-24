import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConfirmService } from '../../core/confirm.service';
import { IconComponent } from './icon';

@Component({
  selector: 'app-confirm-dialog',
  imports: [IconComponent],
  template: `
    @if (state().open) {
      <div class="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div
          class="animate-fade-in absolute inset-0 bg-[#060b10]/60 backdrop-blur-[2px]"
          (click)="resolve(false)"
        ></div>
        <div
          class="animate-scale-in card relative w-full max-w-md p-6"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-label]="state().title"
        >
          <div
            class="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
            [class]="state().danger ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-strong'"
          >
            <app-icon [name]="state().danger ? 'alert' : 'info'" [size]="19" />
          </div>
          <h2 class="text-[17px] font-semibold tracking-tight text-ink">{{ state().title }}</h2>
          <p class="mt-1.5 text-[13px] leading-relaxed text-ink-2">{{ state().message }}</p>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" class="btn-secondary" (click)="resolve(false)">
              {{ state().cancelLabel || 'Άκυρο' }}
            </button>
            <button
              type="button"
              [class]="state().danger ? 'btn btn-danger' : 'btn btn-primary'"
              (click)="resolve(true)"
            >
              {{ state().confirmLabel || 'Συνέχεια' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  host: {
    '(document:keydown.escape)': 'state().open && resolve(false)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  private readonly service = inject(ConfirmService);
  readonly state = this.service.state;

  resolve(value: boolean): void {
    this.service.resolve(value);
  }
}
