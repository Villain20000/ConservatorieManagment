import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FormatService } from '../../core/format.service';
import { IconComponent } from '../../shared/ui/icon';

export interface CandidateSlot {
  startsAt: string;
  endsAt: string;
  reason: string;
}

export interface ConflictExplanationItem {
  type: 'ROOM' | 'TEACHER' | 'STUDENT' | 'CALENDAR';
  title: string;
  explanation: string;
}

export interface ConflictResponse {
  hasConflict: boolean;
  conflicts: ConflictExplanationItem[];
  suggestedAlternativeSlots: CandidateSlot[];
}

@Component({
  selector: 'app-conflict-explainer',
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl border border-border bg-surface-2 p-3.5 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <app-icon name="sparkles" [size]="16" class="text-accent" />
          <span class="text-xs font-semibold text-ink">Έλεγχος & Επεξήγηση Συγκρούσεων AI</span>
        </div>
        <button
          type="button"
          class="btn btn-secondary btn-sm flex items-center gap-1.5"
          [disabled]="loading() || !canAnalyze()"
          (click)="analyzeConflicts()"
        >
          <app-icon [name]="loading() ? 'loader' : 'search'" [size]="13" />
          <span>{{ loading() ? 'Ανάλυση...' : 'Έλεγχος Συγκρούσεων' }}</span>
        </button>
      </div>

      @if (report(); as rep) {
        @if (rep.hasConflict) {
          <div class="space-y-2">
            @for (c of rep.conflicts; track c.title) {
              <div class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-800 dark:text-rose-300 space-y-0.5">
                <div class="flex items-center gap-1.5 font-bold">
                  <app-icon name="alert" [size]="14" />
                  <span>{{ c.title }}</span>
                </div>
                <p class="text-[11px] leading-relaxed">{{ c.explanation }}</p>
              </div>
            }

            @if (rep.suggestedAlternativeSlots.length > 0) {
              <div class="pt-2 border-t border-border">
                <p class="text-[11.5px] font-semibold text-ink-2 mb-1.5">
                  Προτεινόμενα Ελεύθερα Slots (Conflict-Free):
                </p>
                <div class="space-y-1.5">
                  @for (slot of rep.suggestedAlternativeSlots; track slot.startsAt) {
                    <div class="flex items-center justify-between rounded-lg border border-border bg-surface p-2 text-xs">
                      <div>
                        <span class="font-bold text-accent">
                          {{ formatSlotTime(slot.startsAt, slot.endsAt) }}
                        </span>
                        <p class="text-[10px] text-ink-3">{{ slot.reason }}</p>
                      </div>
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm py-1 px-2.5 text-[11px]"
                        (click)="applySlot(slot)"
                      >
                        Επιλογή
                      </button>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <app-icon name="badge-check" [size]="16" />
            <span>Κανένας εντοπισμός σύγκρουσης! Το επιλεγμένο slot είναι απόλυτα ελεύθερο.</span>
          </div>
        }
      }
    </div>
  `,
})
export class ConflictExplainerComponent {
  private readonly api = inject(ApiService);
  protected readonly format = inject(FormatService);

  readonly teacherId = input<string | null>(null);
  readonly roomId = input<string | null>(null);
  readonly studentId = input<string | null>(null);
  readonly startTime = input<string>('15:00');
  readonly durationMinutes = input<number>(45);

  readonly slotApplied = output<{ startTime: string }>();

  readonly loading = signal<boolean>(false);
  readonly report = signal<ConflictResponse | null>(null);

  canAnalyze(): boolean {
    return !!(this.teacherId() && this.startTime());
  }

  async analyzeConflicts(): Promise<void> {
    if (!this.canAnalyze()) return;
    this.loading.set(true);
    this.report.set(null);

    try {
      const today = new Date();
      const [h, m] = (this.startTime() || '15:00').split(':').map(Number);
      const start = new Date(today);
      start.setHours(h, m, 0, 0);

      const end = new Date(start.getTime() + (this.durationMinutes() || 45) * 60000);

      const res = await firstValueFrom(
        this.api.post<ConflictResponse>('/intelligence/conflicts/explain', {
          teacherId: this.teacherId(),
          roomId: this.roomId() || undefined,
          studentId: this.studentId() || undefined,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
        })
      );
      this.report.set(res);
    } catch {
      // Graceful
    } finally {
      this.loading.set(false);
    }
  }

  applySlot(slot: CandidateSlot): void {
    const d = new Date(slot.startsAt);
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    this.slotApplied.emit({ startTime: `${hours}:${mins}` });
    this.report.set(null);
  }

  formatSlotTime(startIso: string, endIso: string): string {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const sStr = s.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
    const eStr = e.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
    return `${sStr} – ${eStr}`;
  }
}
