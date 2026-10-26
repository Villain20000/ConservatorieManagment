import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FormatService } from '../../core/format.service';
import { IconComponent } from '../../shared/ui/icon';

export interface PracticeAnalyticsData {
  totalMinutesAllTime: number;
  totalMinutesThisWeek: number;
  totalMinutesThisMonth: number;
  currentStreakDays: number;
  weeklyGoalMinutes: number;
  weeklyGoalCompletionRate: number;
  dayOfWeekDistribution: number[]; // Mon-Sun
  instrumentBreakdown: Record<string, number>;
  recentSessions: {
    id: string;
    startedAt: string;
    durationMinutes: number;
    instrument: string;
    pieceTitle?: string | null;
    tempoBpm?: number | null;
    rating?: number | null;
    notes?: string | null;
  }[];
}

@Component({
  selector: 'app-practice-analytics',
  imports: [CommonModule, FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6">
      <!-- Top Metrics Row -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <!-- Streak Card -->
        <div class="card p-5 flex items-center gap-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            <app-icon name="sparkles" [size]="24" />
          </div>
          <div>
            <p class="text-[12px] font-medium text-ink-3">Συνεχόμενο Σερί</p>
            <div class="flex items-baseline gap-1.5">
              <span class="text-2xl font-bold text-ink tabular-nums">{{ analytics()?.currentStreakDays ?? 0 }}</span>
              <span class="text-xs text-ink-3">ημέρες</span>
            </div>
            <p class="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
              {{ (analytics()?.currentStreakDays ?? 0) > 0 ? 'Εξαιρετική συνέπεια!' : 'Ξεκινήστε σήμερα!' }}
            </p>
          </div>
        </div>

        <!-- Weekly Practice Card -->
        <div class="card p-5 flex items-center gap-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <app-icon name="clock" [size]="24" />
          </div>
          <div>
            <p class="text-[12px] font-medium text-ink-3">Μελέτη Εβδομάδας</p>
            <div class="flex items-baseline gap-1.5">
              <span class="text-2xl font-bold text-ink tabular-nums">{{ analytics()?.totalMinutesThisWeek ?? 0 }}</span>
              <span class="text-xs text-ink-3">λεπτά</span>
            </div>
            <p class="text-[11px] text-ink-3 mt-0.5">
              Στόχος: {{ analytics()?.weeklyGoalMinutes ?? 180 }} λεπτά
            </p>
          </div>
        </div>

        <!-- Weekly Goal Completion Rate -->
        <div class="card p-5 flex items-center gap-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <app-icon name="badge-check" [size]="24" />
          </div>
          <div>
            <p class="text-[12px] font-medium text-ink-3">Πρόοδος Στόχου</p>
            <div class="flex items-baseline gap-1.5">
              <span class="text-2xl font-bold text-ink tabular-nums">{{ analytics()?.weeklyGoalCompletionRate ?? 0 }}%</span>
            </div>
            <div class="mt-1.5 h-1.5 w-28 rounded-full bg-surface-2 overflow-hidden border border-border">
              <div
                class="h-full bg-emerald-500 rounded-full transition-all duration-300"
                [style.width.%]="analytics()?.weeklyGoalCompletionRate ?? 0"
              ></div>
            </div>
          </div>
        </div>

        <!-- Total All-Time Minutes -->
        <div class="card p-5 flex items-center gap-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
            <app-icon name="book-open" [size]="24" />
          </div>
          <div>
            <p class="text-[12px] font-medium text-ink-3">Συνολικός Χρόνος</p>
            <div class="flex items-baseline gap-1.5">
              <span class="text-2xl font-bold text-ink tabular-nums">
                {{ formatHours(analytics()?.totalMinutesAllTime ?? 0) }}
              </span>
              <span class="text-xs text-ink-3">ώρες</span>
            </div>
            <p class="text-[11px] text-ink-3 mt-0.5">
              {{ analytics()?.totalMinutesThisMonth ?? 0 }} λεπτά τον τρέχοντα μήνα
            </p>
          </div>
        </div>
      </div>

      <!-- Day of Week Distribution Chart & Instrument Breakdown -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <!-- Day-of-Week Bar Chart -->
        <div class="card p-5 lg:col-span-2">
          <div class="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <h3 class="text-sm font-semibold text-ink">Εβδομαδιαία Κατανομή Μελέτης</h3>
              <p class="text-[12px] text-ink-3">Χρόνος μελέτης ανά ημέρα της εβδομάδας (σε λεπτά)</p>
            </div>
            <button
              type="button"
              class="btn btn-primary btn-sm flex items-center gap-1.5"
              (click)="showLogModal.set(true)"
            >
              <app-icon name="plus" [size]="14" />
              <span>Καταγραφή Μελέτης</span>
            </button>
          </div>

          <div class="mt-6 flex h-48 items-end justify-between gap-2 px-2 pb-2">
            @for (day of weekDays; track $index) {
              <div class="flex flex-1 flex-col items-center gap-2 h-full justify-end">
                <span class="text-[11px] font-bold tabular-nums text-ink-2">
                  {{ (analytics()?.dayOfWeekDistribution?.[$index] ?? 0) }}m
                </span>
                <div
                  class="w-full max-w-[36px] rounded-t-lg bg-accent/80 hover:bg-accent transition-all duration-300"
                  [style.height.%]="getBarHeight(analytics()?.dayOfWeekDistribution?.[$index] ?? 0)"
                ></div>
                <span class="text-[11px] font-medium text-ink-3">{{ day }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Instrument Breakdown -->
        <div class="card p-5">
          <h3 class="text-sm font-semibold text-ink pb-3 border-b border-border">Κατανομή ανά Όργανο</h3>
          @if (hasInstruments()) {
            <div class="mt-4 space-y-3">
              @for (entry of instrumentEntries(); track entry.name) {
                <div>
                  <div class="flex justify-between text-xs font-semibold text-ink-2 mb-1">
                    <span>{{ entry.name }}</span>
                    <span class="tabular-nums font-bold">{{ entry.minutes }} λεπτά</span>
                  </div>
                  <div class="h-2 w-full rounded-full bg-surface-2 border border-border overflow-hidden">
                    <div
                      class="h-full bg-accent rounded-full transition-all duration-300"
                      [style.width.%]="entry.percent"
                    ></div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <p class="mt-6 text-xs text-ink-3 text-center italic">Δεν υπάρχουν ακόμη καταγεγραμμένες συνεδρίες.</p>
          }
        </div>
      </div>

      <!-- Recent Practice Sessions Table -->
      <div class="card p-5">
        <h3 class="text-sm font-semibold text-ink pb-3 border-b border-border">Πρόσφατες Συνεδρίες Μελέτης</h3>
        @if (analytics()?.recentSessions?.length) {
          <div class="mt-3 divide-y divide-border">
            @for (session of analytics()?.recentSessions; track session.id) {
              <div class="py-3 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 border border-border text-accent">
                    <app-icon name="music" [size]="16" />
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <p class="text-xs font-semibold text-ink">{{ session.instrument }}</p>
                      @if (session.pieceTitle) {
                        <span class="text-xs text-ink-3">· {{ session.pieceTitle }}</span>
                      }
                    </div>
                    <p class="text-[11px] text-ink-3">
                      {{ format.date(session.startedAt, 'medium') }}
                      @if (session.tempoBpm) {
                        <span>· Tempo: {{ session.tempoBpm }} BPM</span>
                      }
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-4">
                  <!-- Star Rating -->
                  @if (session.rating) {
                    <div class="flex items-center text-amber-500 text-xs">
                      @for (star of [1, 2, 3, 4, 5]; track star) {
                        <span>{{ star <= (session.rating || 0) ? '★' : '☆' }}</span>
                      }
                    </div>
                  }

                  <span class="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-bold tabular-nums text-ink">
                    {{ session.durationMinutes }} λεπτά
                  </span>
                </div>
              </div>
            }
          </div>
        } @else {
          <p class="mt-4 text-xs text-ink-3 text-center italic">Καμία συνεδρία ακόμα. Πατήστε "Καταγραφή Μελέτης" για να προσθέσετε την πρώτη σας συνεδρία.</p>
        }
      </div>

      <!-- Log Session Modal -->
      @if (showLogModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div class="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div class="flex items-center justify-between pb-3 border-b border-border">
              <h3 class="text-sm font-bold text-ink">Καταγραφή Συνεδρίας Μελέτης</h3>
              <button type="button" class="btn-ghost btn-icon-sm" (click)="showLogModal.set(false)">
                <app-icon name="x" [size]="16" />
              </button>
            </div>

            <form (ngSubmit)="submitLog()" class="mt-4 space-y-4">
              <div>
                <label class="block text-xs font-semibold text-ink-2 mb-1">Μουσικό Όργανο *</label>
                <input
                  type="text"
                  [(ngModel)]="formInstrument"
                  name="instrument"
                  required
                  placeholder="π.χ. Πιάνο, Βιολί, Κλασική Κιθάρα"
                  class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-ink-2 mb-1">Τίτλος Κομματιού / Άσκηση</label>
                <input
                  type="text"
                  [(ngModel)]="formPieceTitle"
                  name="pieceTitle"
                  placeholder="π.χ. Bach Invention No. 1, Κλίμακα Ντο Μείζονα"
                  class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-ink-2 mb-1">Διάρκεια (λεπτά) *</label>
                  <input
                    type="number"
                    [(ngModel)]="formDurationMinutes"
                    name="durationMinutes"
                    min="1"
                    max="600"
                    required
                    class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label class="block text-xs font-semibold text-ink-2 mb-1">Tempo Μελέτης (BPM)</label>
                  <input
                    type="number"
                    [(ngModel)]="formTempoBpm"
                    name="tempoBpm"
                    min="30"
                    max="300"
                    placeholder="π.χ. 88"
                    class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-ink-2 mb-1">Αυτοαξιολόγηση (1-5)</label>
                <div class="flex items-center gap-2">
                  @for (star of [1, 2, 3, 4, 5]; track star) {
                    <button
                      type="button"
                      class="text-xl transition-transform hover:scale-110"
                      [class.text-amber-500]="star <= formRating"
                      [class.text-zinc-400]="star > formRating"
                      (click)="formRating = star"
                    >
                      ★
                    </button>
                  }
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-ink-2 mb-1">Σημειώσεις Μελέτης</label>
                <textarea
                  [(ngModel)]="formNotes"
                  name="notes"
                  rows="3"
                  placeholder="Σημεία που δυσκόλεψαν, παρατηρήσεις δακτυλοθεσίας..."
                  class="w-full rounded-xl border border-border bg-surface-2 p-3 text-xs text-ink outline-none focus:border-accent"
                ></textarea>
              </div>

              <div class="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  (click)="showLogModal.set(false)"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  [disabled]="isSaving() || !formInstrument || formDurationMinutes < 1"
                >
                  {{ isSaving() ? 'Αποθήκευση...' : 'Αποθήκευση Συνεδρίας' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </section>
  `,
})
export class PracticeAnalyticsComponent implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly format = inject(FormatService);

  readonly analytics = signal<PracticeAnalyticsData | null>(null);
  readonly showLogModal = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);

  readonly weekDays = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'];

  formInstrument = 'Πιάνο';
  formPieceTitle = '';
  formDurationMinutes = 45;
  formTempoBpm: number | null = null;
  formRating = 4;
  formNotes = '';

  ngOnInit(): void {
    void this.loadAnalytics();
  }

  async loadAnalytics(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.api.get<PracticeAnalyticsData>('/practice/analytics')
      );
      this.analytics.set(data);
    } catch {
      // Offline fallback or empty
    }
  }

  formatHours(mins: number): string {
    return (mins / 60).toFixed(1);
  }

  getBarHeight(minutes: number): number {
    const max = Math.max(...(this.analytics()?.dayOfWeekDistribution ?? [1]), 60);
    return Math.max(8, Math.min(100, Math.round((minutes / max) * 100)));
  }

  hasInstruments(): boolean {
    const b = this.analytics()?.instrumentBreakdown;
    return !!b && Object.keys(b).length > 0;
  }

  instrumentEntries(): { name: string; minutes: number; percent: number }[] {
    const b = this.analytics()?.instrumentBreakdown || {};
    const total = Object.values(b).reduce((acc, curr) => acc + curr, 0) || 1;
    return Object.entries(b).map(([name, minutes]) => ({
      name,
      minutes,
      percent: Math.round((minutes / total) * 100),
    }));
  }

  async submitLog(): Promise<void> {
    this.isSaving.set(true);
    try {
      const now = new Date();
      const started = new Date(now.getTime() - this.formDurationMinutes * 60000);

      await firstValueFrom(
        this.api.post('/practice/sessions', {
          startedAt: started.toISOString(),
          endedAt: now.toISOString(),
          durationMinutes: this.formDurationMinutes,
          instrument: this.formInstrument,
          pieceTitle: this.formPieceTitle || undefined,
          tempoBpm: this.formTempoBpm || undefined,
          rating: this.formRating || undefined,
          notes: this.formNotes || undefined,
        })
      );

      this.showLogModal.set(false);
      this.resetForm();
      await this.loadAnalytics();
    } catch {
      // Handle error gracefully
    } finally {
      this.isSaving.set(false);
    }
  }

  private resetForm(): void {
    this.formPieceTitle = '';
    this.formDurationMinutes = 45;
    this.formTempoBpm = null;
    this.formRating = 4;
    this.formNotes = '';
  }
}
