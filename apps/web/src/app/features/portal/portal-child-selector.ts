import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PortalContextService } from '../../core/portal-context.service';

/** Child picker for guardian portal views. Hidden unless several children exist. */
@Component({
  selector: 'app-portal-child-selector',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (portal.needsSelection()) {
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <label class="text-[12px] font-semibold text-ink-2" for="portal-child">
          {{ 'portal.child.label' | transloco }}
        </label>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="portal-child">
          @for (child of portal.children(); track child.id) {
            <button
              type="button"
              class="btn btn-sm"
              [class.btn-primary]="portal.selectedId() === child.id"
              [class.btn-secondary]="portal.selectedId() !== child.id"
              (click)="pick(child.id)"
            >
              {{ child.firstName }} {{ child.lastName }}
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class PortalChildSelectorComponent {
  protected readonly portal = inject(PortalContextService);
  readonly changed = output<string>();

  async ngOnInit(): Promise<void> {
    await this.portal.ensureLoaded();
  }

  pick(id: string): void {
    this.portal.select(id);
    this.changed.emit(id);
  }
}
