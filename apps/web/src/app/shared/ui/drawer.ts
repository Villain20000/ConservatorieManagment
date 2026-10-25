import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  OnDestroy,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from './icon';

type DrawerSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<DrawerSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

@Component({
  selector: 'app-drawer',
  imports: [A11yModule, IconComponent, TranslocoPipe],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-[80]">
        <div
          class="animate-fade-in absolute inset-0 bg-[#060b10]/55 backdrop-blur-[2px]"
          (click)="close()"
          aria-hidden="true"
        ></div>
        <aside
          class="animate-slide-in absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface shadow-pop"
          [class]="sizeClass()"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="translateTitle() ? (title() | transloco) : title()"
          cdkTrapFocus
          tabindex="-1"
        >
          <header class="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div class="min-w-0">
              <h2 class="truncate text-[17px] font-semibold tracking-tight">
                {{ translateTitle() ? (title() | transloco) : title() }}
              </h2>
              @if (subtitle()) {
                <p class="mt-0.5 text-[12.5px] text-ink-3">{{ subtitle() }}</p>
              }
            </div>
            <button type="button" class="btn-ghost btn-icon-sm shrink-0" (click)="close()" aria-label="Κλείσιμο">
              <app-icon name="x" [size]="17" />
            </button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <ng-content />
          </div>
          @if (showFooter()) {
            <footer class="shrink-0 border-t border-line bg-surface-2/60 px-5 py-4 sm:px-6">
              <ng-content select="[drawer-footer]" />
            </footer>
          }
        </aside>
      </div>
    }
  `,
  host: {
    '(document:keydown.escape)': 'onEscape()',
    '[attr.title]': 'null',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawerComponent implements OnDestroy {
  private readonly previousOverflow = document.body.style.overflow;

  readonly open = input(false);
  readonly title = input('');
  readonly subtitle = input('');
  readonly size = input<DrawerSize>('md');
  readonly showFooter = input(false);
  readonly translateTitle = input(true);
  readonly closed = output<void>();

  constructor() {
    effect(() => {
      document.body.style.overflow = this.open() ? 'hidden' : this.previousOverflow;
    });
  }

  sizeClass(): string {
    return SIZES[this.size()];
  }

  close(): void {
    this.closed.emit();
  }

  onEscape(): void {
    if (this.open()) this.close();
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousOverflow;
  }
}
