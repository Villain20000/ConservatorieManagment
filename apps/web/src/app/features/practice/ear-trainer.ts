import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../shared/ui/icon';

export interface IntervalDef {
  semitones: number;
  nameEl: string;
  nameEn: string;
  short: string;
}

const INTERVALS: IntervalDef[] = [
  { semitones: 1, nameEl: '2η μικρή', nameEn: 'Minor 2nd', short: 'm2' },
  { semitones: 2, nameEl: '2η μεγάλη', nameEn: 'Major 2nd', short: 'M2' },
  { semitones: 3, nameEl: '3η μικρή', nameEn: 'Minor 3rd', short: 'm3' },
  { semitones: 4, nameEl: '3η μεγάλη', nameEn: 'Major 3rd', short: 'M3' },
  { semitones: 5, nameEl: '4η καθαρή', nameEn: 'Perfect 4th', short: 'P4' },
  { semitones: 6, nameEl: 'Τρίτονο', nameEn: 'Tritone', short: 'TT' },
  { semitones: 7, nameEl: '5η καθαρή', nameEn: 'Perfect 5th', short: 'P5' },
  { semitones: 8, nameEl: '6η μικρή', nameEn: 'Minor 6th', short: 'm6' },
  { semitones: 9, nameEl: '6η μεγάλη', nameEn: 'Major 6th', short: 'M6' },
  { semitones: 10, nameEl: '7η μικρή', nameEn: 'Minor 7th', short: 'm7' },
  { semitones: 11, nameEl: '7η μεγάλη', nameEn: 'Major 7th', short: 'M7' },
  { semitones: 12, nameEl: 'Οκτάβα', nameEn: 'Octave', short: 'P8' },
];

// Base notes between C4 (261.63Hz) and G4 (392.00Hz)
const BASE_FREQS = [261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.0];

@Component({
  selector: 'app-ear-trainer',
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card p-5">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-ink">Ακουστική Εξάσκηση (Ear Training)</h3>
          <p class="mt-0.5 text-[12px] text-ink-3">Αναγνώριση μουσικών διαστημάτων με ακρόαση</p>
        </div>
        <div class="flex items-center gap-3 text-xs font-semibold tabular-nums">
          <div class="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <app-icon name="badge-check" [size]="14" />
            <span>Σκορ: {{ correct() }}/{{ total() }}</span>
          </div>
          <div class="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <app-icon name="sparkles" [size]="14" />
            <span>Σερί: {{ streak() }}</span>
          </div>
        </div>
      </div>

      <!-- Playback Controls -->
      <div class="mt-4 flex flex-col items-center justify-center rounded-xl bg-surface-alt/60 border border-border p-5">
        <div class="flex items-center gap-3 mb-3">
          <button
            type="button"
            class="btn btn-primary px-5 py-2.5 flex items-center gap-2 text-sm font-semibold shadow-xs"
            (click)="playCurrent()"
            [disabled]="isPlaying()"
          >
            <app-icon name="music" [size]="16" />
            {{ isPlaying() ? 'Αναπαραγωγή…' : 'Ακρόαση Διαστήματος' }}
          </button>
          <button
            type="button"
            class="btn btn-outline btn-sm flex items-center gap-1.5"
            (click)="newInterval()"
            [disabled]="isPlaying()"
          >
            <app-icon name="refresh" [size]="14" />
            Νέο Διάστημα
          </button>
        </div>

        <div class="flex items-center gap-2 text-xs text-ink-2">
          <span>Τρόπος:</span>
          <button
            type="button"
            class="px-2 py-0.5 rounded text-[11px] font-medium"
            [class.bg-accent]="mode() === 'ascending'"
            [class.text-white]="mode() === 'ascending'"
            [class.bg-surface]="mode() !== 'ascending'"
            (click)="mode.set('ascending')"
          >
            Ανοδικό
          </button>
          <button
            type="button"
            class="px-2 py-0.5 rounded text-[11px] font-medium"
            [class.bg-accent]="mode() === 'descending'"
            [class.text-white]="mode() === 'descending'"
            [class.bg-surface]="mode() !== 'descending'"
            (click)="mode.set('descending')"
          >
            Καθοδικό
          </button>
          <button
            type="button"
            class="px-2 py-0.5 rounded text-[11px] font-medium"
            [class.bg-accent]="mode() === 'harmonic'"
            [class.text-white]="mode() === 'harmonic'"
            [class.bg-surface]="mode() !== 'harmonic'"
            (click)="mode.set('harmonic')"
          >
            Αρμονικό
          </button>
        </div>

        @if (feedback(); as fb) {
          <div
            class="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 animate-fadeIn"
            [ngClass]="fb.success ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'"
          >
            <app-icon [name]="fb.success ? 'badge-check' : 'alert'" [size]="14" />
            <span>{{ fb.text }}</span>
          </div>
        }
      </div>

      <!-- Intervals Selection Grid -->
      <div class="mt-4">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-2">
          Επιλέξτε το διάστημα:
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          @for (item of intervals; track item.semitones) {
            <button
              type="button"
              class="btn btn-outline btn-sm text-xs justify-between py-2 px-2.5 transition-all"
              [class.border-emerald-500]="lastAnswer() === item.semitones && lastCorrect() === true"
              [class.bg-emerald-50]="lastAnswer() === item.semitones && lastCorrect() === true"
              [class.dark:bg-emerald-950]="lastAnswer() === item.semitones && lastCorrect() === true"
              [class.border-red-500]="lastAnswer() === item.semitones && lastCorrect() === false"
              [class.bg-red-50]="lastAnswer() === item.semitones && lastCorrect() === false"
              (click)="guess(item)"
              [disabled]="isPlaying() || answered()"
            >
              <span>{{ item.nameEl }}</span>
              <span class="text-[10px] font-mono text-ink-3">({{ item.short }})</span>
            </button>
          }
        </div>
      </div>
    </section>
  `,
})
export class EarTrainerComponent implements OnDestroy {
  readonly intervals = INTERVALS;

  readonly mode = signal<'ascending' | 'descending' | 'harmonic'>('ascending');
  readonly currentInterval = signal<IntervalDef>(INTERVALS[3]); // Default Major 3rd
  readonly baseFreq = signal<number>(261.63);
  readonly isPlaying = signal<boolean>(false);
  readonly answered = signal<boolean>(false);
  readonly lastAnswer = signal<number | null>(null);
  readonly lastCorrect = signal<boolean | null>(null);
  readonly feedback = signal<{ success: boolean; text: string } | null>(null);

  readonly correct = signal<number>(0);
  readonly total = signal<number>(0);
  readonly streak = signal<number>(0);

  private audioCtx: AudioContext | null = null;

  constructor() {
    this.newInterval();
  }

  ngOnDestroy(): void {
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  newInterval(): void {
    const randomInterval = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
    const randomBase = BASE_FREQS[Math.floor(Math.random() * BASE_FREQS.length)];
    this.currentInterval.set(randomInterval);
    this.baseFreq.set(randomBase);
    this.answered.set(false);
    this.lastAnswer.set(null);
    this.lastCorrect.set(null);
    this.feedback.set(null);
    this.playCurrent();
  }

  async playCurrent(): Promise<void> {
    if (this.isPlaying()) return;
    this.isPlaying.set(true);

    try {
      this.audioCtx ??= new AudioContext();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const root = this.baseFreq();
      const semitones = this.currentInterval().semitones;
      const target = root * Math.pow(2, semitones / 12);
      const m = this.mode();

      const now = this.audioCtx.currentTime + 0.05;

      if (m === 'ascending') {
        this.playTone(root, now, 0.5);
        this.playTone(target, now + 0.55, 0.7);
        setTimeout(() => this.isPlaying.set(false), 1300);
      } else if (m === 'descending') {
        this.playTone(target, now, 0.5);
        this.playTone(root, now + 0.55, 0.7);
        setTimeout(() => this.isPlaying.set(false), 1300);
      } else {
        // Harmonic
        this.playTone(root, now, 0.9);
        this.playTone(target, now, 0.9);
        setTimeout(() => this.isPlaying.set(false), 1000);
      }
    } catch {
      this.isPlaying.set(false);
    }
  }

  guess(item: IntervalDef): void {
    if (this.answered()) return;

    this.answered.set(true);
    this.total.update((t) => t + 1);
    this.lastAnswer.set(item.semitones);

    const isMatch = item.semitones === this.currentInterval().semitones;
    this.lastCorrect.set(isMatch);

    if (isMatch) {
      this.correct.update((c) => c + 1);
      this.streak.update((s) => s + 1);
      this.feedback.set({
        success: true,
        text: `Σωστά! Ήταν ${this.currentInterval().nameEl} (${this.currentInterval().short})`,
      });
      this.playSuccessChime();
    } else {
      this.streak.set(0);
      this.feedback.set({
        success: false,
        text: `Λάθος. Ήταν ${this.currentInterval().nameEl} (${this.currentInterval().short})`,
      });
    }
  }

  private playTone(freq: number, startTime: number, duration: number): void {
    if (!this.audioCtx) return;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  private playSuccessChime(): void {
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime + 0.05;
    this.playTone(523.25, now, 0.15); // C5
    this.playTone(659.25, now + 0.12, 0.25); // E5
  }
}
