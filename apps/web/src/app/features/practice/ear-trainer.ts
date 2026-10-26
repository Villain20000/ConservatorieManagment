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

export interface ChordDef {
  intervals: number[];
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

const CHORDS: ChordDef[] = [
  { intervals: [0, 4, 7], nameEl: 'Μείζονα (Maj)', nameEn: 'Major Triad', short: 'Maj' },
  { intervals: [0, 3, 7], nameEl: 'Ελάσσονα (Min)', nameEn: 'Minor Triad', short: 'Min' },
  { intervals: [0, 3, 6], nameEl: 'Ελαττωμένη (Dim)', nameEn: 'Diminished', short: 'Dim' },
  { intervals: [0, 4, 8], nameEl: 'Αυξημένη (Aug)', nameEn: 'Augmented', short: 'Aug' },
  { intervals: [0, 4, 7, 10], nameEl: 'Δεσπόζουσα 7ης (Dom7)', nameEn: 'Dominant 7th', short: '7' },
  { intervals: [0, 4, 7, 11], nameEl: 'Μείζονα 7ης (Maj7)', nameEn: 'Major 7th', short: 'Maj7' },
  { intervals: [0, 3, 7, 10], nameEl: 'Ελάσσονα 7ης (m7)', nameEn: 'Minor 7th', short: 'm7' },
];

const BASE_FREQS = [261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.0];

type TrainingCategory = 'intervals' | 'chords';

@Component({
  selector: 'app-ear-trainer',
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-ink">Ακουστική Εξάσκηση (Ear Training Studio)</h3>
          <p class="mt-0.5 text-[12px] text-ink-3">Αναγνώριση μουσικών διαστημάτων & συγχορδιών με ακρόαση</p>
        </div>
        <div class="flex items-center gap-3 text-xs font-semibold tabular-nums">
          <div class="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <app-icon name="badge-check" [size]="14" />
            <span>Σκορ: {{ correct() }}/{{ total() }} ({{ accuracy() }}%)</span>
          </div>
          <div class="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <app-icon name="sparkles" [size]="14" />
            <span>Σερί: {{ streak() }}</span>
          </div>
        </div>
      </div>

      <!-- Category Selector: Intervals vs Chords -->
      <div class="mt-4 flex gap-2 border-b border-border pb-3">
        <button
          type="button"
          class="btn btn-sm"
          [class.btn-primary]="category() === 'intervals'"
          [class.btn-secondary]="category() !== 'intervals'"
          (click)="switchCategory('intervals')"
        >
          Διαστήματα (Intervals)
        </button>
        <button
          type="button"
          class="btn btn-sm"
          [class.btn-primary]="category() === 'chords'"
          [class.btn-secondary]="category() !== 'chords'"
          (click)="switchCategory('chords')"
        >
          Συγχορδίες (Chords)
        </button>
      </div>

      <!-- Playback Controls -->
      <div class="mt-4 flex flex-col items-center justify-center rounded-xl bg-surface-2 border border-border p-5">
        <div class="flex flex-wrap items-center justify-center gap-3 mb-3">
          <button
            type="button"
            class="btn btn-primary px-5 py-2.5 flex items-center gap-2 text-sm font-semibold shadow-xs"
            (click)="playCurrent()"
            [disabled]="isPlaying()"
          >
            <app-icon name="music" [size]="16" />
            {{ isPlaying() ? 'Αναπαραγωγή…' : (category() === 'intervals' ? 'Ακρόαση Διαστήματος' : 'Ακρόαση Συγχορδίας') }}
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm flex items-center gap-1.5"
            (click)="newChallenge()"
            [disabled]="isPlaying()"
          >
            <app-icon name="refresh" [size]="14" />
            Νέα Ερώτηση
          </button>
        </div>

        @if (category() === 'intervals') {
          <div class="flex items-center gap-2 text-xs text-ink-2">
            <span>Τρόπος:</span>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              [class.bg-accent]="mode() === 'ascending'"
              [class.text-white]="mode() === 'ascending'"
              [class.bg-surface]="mode() !== 'ascending'"
              (click)="mode.set('ascending')"
            >
              Ανοδικό
            </button>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              [class.bg-accent]="mode() === 'descending'"
              [class.text-white]="mode() === 'descending'"
              [class.bg-surface]="mode() !== 'descending'"
              (click)="mode.set('descending')"
            >
              Καθοδικό
            </button>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              [class.bg-accent]="mode() === 'harmonic'"
              [class.text-white]="mode() === 'harmonic'"
              [class.bg-surface]="mode() !== 'harmonic'"
              (click)="mode.set('harmonic')"
            >
              Αρμονικό
            </button>
          </div>
        } @else {
          <div class="flex items-center gap-2 text-xs text-ink-2">
            <span>Τρόπος Συγχορδίας:</span>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              [class.bg-accent]="chordMode() === 'block'"
              [class.text-white]="chordMode() === 'block'"
              [class.bg-surface]="chordMode() !== 'block'"
              (click)="chordMode.set('block')"
            >
              Μπλοκ (Block)
            </button>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              [class.bg-accent]="chordMode() === 'arpeggio'"
              [class.text-white]="chordMode() === 'arpeggio'"
              [class.bg-surface]="chordMode() !== 'arpeggio'"
              (click)="chordMode.set('arpeggio')"
            >
              Αρπίζ (Arpeggio)
            </button>
          </div>
        }

        @if (feedback()) {
          <div
            class="mt-3 text-sm font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 animate-in fade-in"
            [class.bg-emerald-50]="lastCorrect()"
            [class.text-emerald-700]="lastCorrect()"
            [class.dark:bg-emerald-950/40]="lastCorrect()"
            [class.dark:text-emerald-300]="lastCorrect()"
            [class.bg-rose-50]="!lastCorrect()"
            [class.text-rose-700]="!lastCorrect()"
            [class.dark:bg-rose-950/40]="!lastCorrect()"
            [class.dark:text-rose-300]="!lastCorrect()"
          >
            <app-icon [name]="lastCorrect() ? 'badge-check' : 'alert'" [size]="15" />
            <span>{{ feedback() }}</span>
          </div>
        }
      </div>

      <!-- Selection Grid -->
      <div class="mt-4">
        @if (category() === 'intervals') {
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            @for (item of intervals; track item.semitones) {
              <button
                type="button"
                class="card p-3 text-left transition-all hover:border-accent hover:shadow-xs group disabled:opacity-50"
                [class.border-accent]="selectedInterval() === item.semitones"
                [class.bg-accent/5]="selectedInterval() === item.semitones"
                (click)="answerInterval(item.semitones)"
                [disabled]="hasAnswered()"
              >
                <div class="flex items-center justify-between">
                  <span class="font-mono text-xs font-bold text-accent-strong group-hover:text-accent">
                    {{ item.short }}
                  </span>
                  <span class="text-[10px] text-ink-3 tabular-nums">{{ item.semitones }}ημ.</span>
                </div>
                <div class="mt-1 text-xs font-medium text-ink truncate">{{ item.nameEl }}</div>
                <div class="text-[10px] text-ink-3 truncate">{{ item.nameEn }}</div>
              </button>
            }
          </div>
        } @else {
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            @for (ch of chords; track ch.short) {
              <button
                type="button"
                class="card p-3.5 text-left transition-all hover:border-accent hover:shadow-xs group disabled:opacity-50"
                [class.border-accent]="selectedChord() === ch.short"
                [class.bg-accent/5]="selectedChord() === ch.short"
                (click)="answerChord(ch.short)"
                [disabled]="hasAnswered()"
              >
                <div class="flex items-center justify-between">
                  <span class="font-mono text-sm font-bold text-accent-strong">
                    {{ ch.short }}
                  </span>
                  <span class="text-[10px] text-ink-3 tabular-nums">{{ ch.intervals.length }} φωνές</span>
                </div>
                <div class="mt-1 text-xs font-medium text-ink">{{ ch.nameEl }}</div>
                <div class="text-[10px] text-ink-3">{{ ch.nameEn }}</div>
              </button>
            }
          </div>
        }
      </div>
    </section>
  `,
})
export class EarTrainerComponent implements OnDestroy {
  readonly intervals = INTERVALS;
  readonly chords = CHORDS;

  readonly category = signal<TrainingCategory>('intervals');
  readonly mode = signal<'ascending' | 'descending' | 'harmonic'>('ascending');
  readonly chordMode = signal<'block' | 'arpeggio'>('block');

  readonly currentInterval = signal<IntervalDef>(INTERVALS[3]); // Default Major 3rd
  readonly currentChord = signal<ChordDef>(CHORDS[0]); // Default Major
  readonly currentBaseFreq = signal<number>(BASE_FREQS[0]);

  readonly isPlaying = signal<boolean>(false);
  readonly selectedInterval = signal<number | null>(null);
  readonly selectedChord = signal<string | null>(null);
  readonly hasAnswered = signal<boolean>(false);
  readonly feedback = signal<string | null>(null);
  readonly lastCorrect = signal<boolean>(false);

  readonly correct = signal<number>(0);
  readonly total = signal<number>(0);
  readonly streak = signal<number>(0);

  readonly accuracy = computed(() => {
    const t = this.total();
    return t === 0 ? 0 : Math.round((this.correct() / t) * 100);
  });

  private audioCtx: AudioContext | null = null;

  constructor() {
    this.newChallenge();
  }

  ngOnDestroy(): void {
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  switchCategory(cat: TrainingCategory): void {
    this.category.set(cat);
    this.newChallenge();
  }

  newChallenge(): void {
    const baseFreq = BASE_FREQS[Math.floor(Math.random() * BASE_FREQS.length)];
    this.currentBaseFreq.set(baseFreq);
    this.hasAnswered.set(false);
    this.selectedInterval.set(null);
    this.selectedChord.set(null);
    this.feedback.set(null);

    if (this.category() === 'intervals') {
      const idx = Math.floor(Math.random() * INTERVALS.length);
      this.currentInterval.set(INTERVALS[idx]);
    } else {
      const idx = Math.floor(Math.random() * CHORDS.length);
      this.currentChord.set(CHORDS[idx]);
    }
  }

  newInterval(): void {
    this.newChallenge();
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  async playCurrent(): Promise<void> {
    if (this.isPlaying()) return;
    this.isPlaying.set(true);

    if (this.category() === 'intervals') {
      await this.playIntervalAudio();
    } else {
      await this.playChordAudio();
    }

    this.isPlaying.set(false);
  }

  private async playIntervalAudio(): Promise<void> {
    const ctx = this.getAudioContext();
    const base = this.currentBaseFreq();
    const semitones = this.currentInterval().semitones;
    const targetFreq = base * Math.pow(2, semitones / 12);
    const m = this.mode();

    if (m === 'ascending') {
      this.playTone(base, 0, 0.6);
      await this.sleep(600);
      this.playTone(targetFreq, 0, 0.9);
      await this.sleep(900);
    } else if (m === 'descending') {
      this.playTone(targetFreq, 0, 0.6);
      await this.sleep(600);
      this.playTone(base, 0, 0.9);
      await this.sleep(900);
    } else {
      // Harmonic (together)
      this.playTone(base, 0, 1.2);
      this.playTone(targetFreq, 0, 1.2);
      await this.sleep(1200);
    }
  }

  private async playChordAudio(): Promise<void> {
    const base = this.currentBaseFreq();
    const chord = this.currentChord();
    const cm = this.chordMode();

    if (cm === 'block') {
      for (const st of chord.intervals) {
        const freq = base * Math.pow(2, st / 12);
        this.playTone(freq, 0, 1.4);
      }
      await this.sleep(1400);
    } else {
      // Arpeggio
      for (let i = 0; i < chord.intervals.length; i++) {
        const st = chord.intervals[i];
        const freq = base * Math.pow(2, st / 12);
        this.playTone(freq, 0, 0.5);
        await this.sleep(350);
      }
      await this.sleep(400);
    }
  }

  private playTone(freq: number, startDelaySec: number, durationSec: number): void {
    const ctx = this.getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelaySec);

    const now = ctx.currentTime + startDelaySec;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.05);
  }

  answerInterval(semitones: number): void {
    if (this.hasAnswered()) return;
    this.hasAnswered.set(true);
    this.selectedInterval.set(semitones);
    this.total.update((t) => t + 1);

    const target = this.currentInterval();
    if (semitones === target.semitones) {
      this.correct.update((c) => c + 1);
      this.streak.update((s) => s + 1);
      this.lastCorrect.set(true);
      this.feedback.set(`Σωστά! Ήταν ${target.nameEl} (${target.short})`);
    } else {
      this.streak.set(0);
      this.lastCorrect.set(false);
      this.feedback.set(`Λάθος. Ήταν ${target.nameEl} (${target.short})`);
    }
  }

  answerChord(short: string): void {
    if (this.hasAnswered()) return;
    this.hasAnswered.set(true);
    this.selectedChord.set(short);
    this.total.update((t) => t + 1);

    const target = this.currentChord();
    if (short === target.short) {
      this.correct.update((c) => c + 1);
      this.streak.update((s) => s + 1);
      this.lastCorrect.set(true);
      this.feedback.set(`Σωστά! Ήταν ${target.nameEl}`);
    } else {
      this.streak.set(0);
      this.lastCorrect.set(false);
      this.feedback.set(`Λάθος. Ήταν ${target.nameEl}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
