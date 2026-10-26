import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FormatService } from '../../core/format.service';
import { IconComponent } from '../../shared/ui/icon';

export interface DailyDigestRecord {
  id: string;
  digestDate: string;
  status: 'DRAFT' | 'APPROVED' | 'DISPATCHED' | 'REJECTED';
  title: string;
  summaryEl: string;
  summaryEn: string;
  payload: {
    metrics: {
      activeStudents: number;
      todayLessons: number;
      attendedLessons: number;
      overdueChargesCount: number;
      overdueAmountCents: number;
      upcomingEventsCount: number;
    };
  };
  createdAt: string;
  reviewedAt?: string | null;
}

@Component({
  selector: 'app-daily-digest-modal',
  imports: [CommonModule, FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div class="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-2xl flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="flex items-center justify-between pb-3 border-b border-border">
          <div class="flex items-center gap-2.5">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <app-icon name="sparkles" [size]="18" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-ink">Ημερήσια Σύνοψη Διοίκησης (AI Daily Digest)</h3>
              <p class="text-[11.5px] text-ink-3">Συνοπτική επιχειρησιακή ενημέρωση με έγκριση ανθρώπου (Human-in-the-Loop)</p>
            </div>
          </div>
          <button type="button" class="btn-ghost btn-icon-sm" (click)="close.emit()">
            <app-icon name="x" [size]="16" />
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto py-4 space-y-4">
          <!-- Human-in-the-Loop Guardrail Notice -->
          <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <app-icon name="shield" [size]="16" class="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <strong>Εγγύηση Ανθρώπινης Επίβλεψης:</strong>
              Το σύστημα συντάσσει προσχέδιο σύνοψης βασισμένο στα δεδομένα της ημέρας. Καμία ανακοίνωση δεν αποστέλλεται αυτόματα χωρίς τη ρητή επιθεώρηση και έγκριση του Διευθυντή ή της Γραμματείας.
            </div>
          </div>

          <!-- Loading State -->
          @if (loading()) {
            <div class="flex flex-col items-center justify-center py-12 text-ink-3">
              <app-icon name="loader" [size]="24" class="animate-spin text-accent mb-2" />
              <p class="text-xs">Φόρτωση σύνοψης...</p>
            </div>
          } @else if (digest(); as d) {
            <!-- Status & Date Header -->
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 p-3 border border-border">
              <div>
                <p class="text-xs font-bold text-ink">{{ d.title }}</p>
                <p class="text-[11px] text-ink-3">Ημερομηνία: {{ format.date(d.digestDate, 'long') }}</p>
              </div>
              <span
                class="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
                [class.bg-amber-100]="d.status === 'DRAFT'"
                [class.text-amber-800]="d.status === 'DRAFT'"
                [class.bg-emerald-100]="d.status === 'APPROVED' || d.status === 'DISPATCHED'"
                [class.text-emerald-800]="d.status === 'APPROVED' || d.status === 'DISPATCHED'"
              >
                {{ d.status === 'DRAFT' ? 'Προσχέδιο (Draft)' : (d.status === 'APPROVED' ? 'Εγκεκριμένο' : 'Απεστάλη') }}
              </span>
            </div>

            <!-- Key Metrics Grid -->
            @if (d.payload?.metrics; as m) {
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div class="rounded-lg border border-border bg-surface p-2.5 text-center">
                  <p class="text-[10.5px] text-ink-3">Ενεργοί Μαθητές</p>
                  <p class="text-sm font-bold text-ink tabular-nums mt-0.5">{{ m.activeStudents }}</p>
                </div>
                <div class="rounded-lg border border-border bg-surface p-2.5 text-center">
                  <p class="text-[10.5px] text-ink-3">Μαθήματα Σήμερα</p>
                  <p class="text-sm font-bold text-ink tabular-nums mt-0.5">{{ m.todayLessons }}</p>
                </div>
                <div class="rounded-lg border border-border bg-surface p-2.5 text-center">
                  <p class="text-[10.5px] text-ink-3">Ληξιπρόθεσμα</p>
                  <p class="text-sm font-bold text-rose-600 tabular-nums mt-0.5">{{ format.money(m.overdueAmountCents) }}</p>
                </div>
                <div class="rounded-lg border border-border bg-surface p-2.5 text-center">
                  <p class="text-[10.5px] text-ink-3">Εκδηλώσεις</p>
                  <p class="text-sm font-bold text-ink tabular-nums mt-0.5">{{ m.upcomingEventsCount }}</p>
                </div>
              </div>
            }

            <!-- Language Selector for Summary -->
            <div class="flex gap-2 border-b border-border pb-2">
              <button
                type="button"
                class="btn btn-sm"
                [class.btn-primary]="selectedLang() === 'el'"
                [class.btn-secondary]="selectedLang() !== 'el'"
                (click)="selectedLang.set('el')"
              >
                Ελληνική Σύνοψη
              </button>
              <button
                type="button"
                class="btn btn-sm"
                [class.btn-primary]="selectedLang() === 'en'"
                [class.btn-secondary]="selectedLang() !== 'en'"
                (click)="selectedLang.set('en')"
              >
                English Summary
              </button>
            </div>

            <!-- Markdown Content View -->
            <div class="rounded-xl border border-border bg-surface-2 p-4 text-xs leading-relaxed text-ink font-mono whitespace-pre-wrap">
              {{ selectedLang() === 'el' ? d.summaryEl : d.summaryEn }}
            </div>

            <!-- Reviewer Notes / Adjustments -->
            @if (d.status === 'DRAFT') {
              <div>
                <label class="block text-xs font-semibold text-ink-2 mb-1">Σημειώσεις Επιθεώρησης / Οδηγίες:</label>
                <textarea
                  [(ngModel)]="reviewNotes"
                  name="reviewNotes"
                  rows="2"
                  placeholder="Προσθέστε τυχόν διευκρινίσεις ή οδηγίες προς το εκπαιδευτικό προσωπικό..."
                  class="w-full rounded-xl border border-border bg-surface p-2.5 text-xs text-ink outline-none focus:border-accent"
                ></textarea>
              </div>
            }
          } @else {
            <div class="py-8 text-center text-xs text-ink-3">
              <p>Δεν έχει παραχθεί σύνοψη για τη σημερινή ημέρα.</p>
              <button
                type="button"
                class="btn btn-primary btn-sm mt-3"
                (click)="generateNewDigest()"
              >
                Δημιουργία Νέας Σύνοψης AI
              </button>
            </div>
          }
        </div>

        <!-- Footer Actions -->
        <div class="flex items-center justify-between pt-3 border-t border-border">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            [disabled]="loading() || isActionInProgress()"
            (click)="generateNewDigest()"
          >
            <app-icon name="sparkles" [size]="14" />
            <span>Αναγέννηση Σύνοψης</span>
          </button>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              (click)="close.emit()"
            >
              Κλείσιμο
            </button>

            @if (digest()?.status === 'DRAFT') {
              <button
                type="button"
                class="btn btn-primary btn-sm flex items-center gap-1.5"
                [disabled]="isActionInProgress()"
                (click)="reviewDigest('APPROVED')"
              >
                <app-icon name="check" [size]="14" />
                <span>Έγκριση Σύνοψης</span>
              </button>

              <button
                type="button"
                class="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
                [disabled]="isActionInProgress()"
                (click)="reviewDigest('DISPATCHED')"
              >
                <app-icon name="send" [size]="14" />
                <span>Έγκριση & Αποστολή</span>
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DailyDigestModalComponent implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly format = inject(FormatService);

  readonly close = output<void>();

  readonly loading = signal<boolean>(false);
  readonly isActionInProgress = signal<boolean>(false);
  readonly digest = signal<DailyDigestRecord | null>(null);
  readonly selectedLang = signal<'el' | 'en'>('el');

  reviewNotes = '';

  ngOnInit(): void {
    void this.loadTodayDigest();
  }

  async loadTodayDigest(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(
        this.api.get<{ data: DailyDigestRecord[] }>('/intelligence/digests', { pageSize: 1 })
      );
      if (res?.data?.length > 0) {
        this.digest.set(res.data[0]);
      } else {
        await this.generateNewDigest();
      }
    } catch {
      // If none found, generate
      await this.generateNewDigest();
    } finally {
      this.loading.set(false);
    }
  }

  async generateNewDigest(): Promise<void> {
    this.loading.set(true);
    try {
      const created = await firstValueFrom(
        this.api.post<DailyDigestRecord>('/intelligence/digests/generate', {})
      );
      this.digest.set(created);
    } catch {
      // Graceful error handle
    } finally {
      this.loading.set(false);
    }
  }

  async reviewDigest(action: 'APPROVED' | 'DISPATCHED'): Promise<void> {
    const d = this.digest();
    if (!d) return;

    this.isActionInProgress.set(true);
    try {
      const updated = await firstValueFrom(
        this.api.post<DailyDigestRecord>(`/intelligence/digests/${d.id}/review`, {
          action: action === 'DISPATCHED' ? 'DISPATCH' : 'APPROVE',
          notes: this.reviewNotes || undefined,
        })
      );
      this.digest.set(updated);
    } catch {
      // Error handling
    } finally {
      this.isActionInProgress.set(false);
    }
  }
}
