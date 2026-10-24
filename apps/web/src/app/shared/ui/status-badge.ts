import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

const TONES: Record<string, string> = {
  ACTIVE: 'success',
  PAID: 'success',
  PRESENT: 'success',
  PASS: 'success',
  PUBLISHED: 'success',
  ISSUED: 'success',
  COMPLETED: 'success',
  POSTED: 'success',
  APPROVED: 'success',
  SIGNED: 'success',
  GRADING: 'warning',
  PENDING_APPROVAL: 'warning',
  PLANNED: 'warning',
  TRIAL: 'info',
  TRIALING: 'info',
  SCHEDULED: 'info',
  PENDING: 'warning',
  PARTIAL: 'warning',
  LATE: 'warning',
  DRAFT: 'warning',
  IN_PROGRESS: 'warning',
  INACTIVE: 'neutral',
  EXCUSED: 'neutral',
  ENDED: 'neutral',
  ABSENT: 'danger',
  FAIL: 'danger',
  OVERDUE: 'danger',
  CANCELLED: 'danger',
  VOIDED: 'danger',
  REJECTED: 'danger',
  ARCHIVED: 'danger',
  SUSPENDED: 'danger',
  RESCHEDULED: 'info',
  WITHDRAWN: 'info',
  GRADUATED: 'info',
  PAUSED: 'warning',
  ACTIVE_PLAN: 'success',
};

const CLASSES: Record<string, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
  neutral: 'badge-neutral',
};

@Component({
  selector: 'app-status-badge',
  imports: [TranslocoPipe],
  template: `
    @if (label(); as customLabel) {
      <span class="badge" [class]="classFor()">{{ customLabel }}</span>
    } @else {
      <span class="badge" [class]="classFor()">{{ ('status.' + status()) | transloco }}</span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly status = input.required<string>();
  readonly label = input<string>();

  readonly tone = computed(() => TONES[this.status()] ?? 'neutral');
  readonly classFor = computed(() => CLASSES[this.tone()]);
}
