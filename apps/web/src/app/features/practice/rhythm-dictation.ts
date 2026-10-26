import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../shared/ui/icon';

export type RhythmNoteType = 'quarter' | 'two-eighths' | 'quarter-rest' | 'triplet';

export interface RhythmItem {
  type: RhythmNoteType;
  duration: number; // in beats (quarter = 1)
  labelEl: string;
  labelEn: string;
  symbol: string;
}

export const NOTE_DEFINITIONS: Record<RhythmNoteType, RhythmItem> = {
  quarter: {
    type: 'quarter',
    duration: 1,
    labelEl: 'Τέταρτο (♩)',
    labelEn: 'Quarter (♩)',
    symbol: '♩',
  },
  'two-eighths': {
    type: 'two-eighths',
    duration: 1,
    labelEl: 'Δύο Όγδοα (♫)',
    labelEn: 'Two Eighths (♫)',
    symbol: '♫',
  },
  'quarter-rest': {
    type: 'quarter-rest',
    duration: 1,
    labelEl: 'Παύση Τετάρτου (𝄽)',
    labelEn: 'Quarter Rest (𝄽)',
    symbol: '𝄽',
  },
  triplet: {
    type: 'triplet',
    duration: 1,
    labelEl: 'Τρίηχο Ογδόων (3)',
    labelEn: 'Triplet (3)',
    symbol: '𝅘𝅥𝅯3𝅘𝅥𝅯',
  },
};

interface RhythmPattern {
  id: string;
  nameEl: string;
  nameEn: string;
  difficulty: 'easy' | 'medium' | 'hard';
  beats: RhythmNoteType[]; // exactly 4 beats in 4/4
}

const PATTERNS: RhythmPattern[] = [
  // Easy: Quarters and rests
  {
    id: 'e1',
    nameEl: 'Τέταρτα & Παύση',
    nameEn: 'Quarters & Rest',
    difficulty: 'easy',
    beats: ['quarter', 'quarter', 'quarter-rest', 'quarter'],
  },
  {
    id: 'e2',
    nameEl: 'Διαδοχικά Τέταρτα',
    nameEn: 'Steady Quarters',
    difficulty: 'easy',
    beats: ['quarter', 'quarter', 'quarter', 'quarter'],
  },
  {
    id: 'e3',
    nameEl: 'Εναλλαγή Τετάρτου & Παύσης',
    nameEn: 'Alternating Rest',
    difficulty: 'easy',
    beats: ['quarter', 'quarter-rest', 'quarter', 'quarter-rest'],
  },
  // Medium: Incorporates two-eighths
  {
    id: 'm1',
    nameEl: 'Όγδοα στο 2ο και 4ο',
    nameEn: 'Eighths on 2 & 4',
    difficulty: 'medium',
    beats: ['quarter', 'two-eighths', 'quarter', 'two-eighths'],
  },
  {
    id: 'm2',
    nameEl: 'Συγκοπή & Όγδοα',
    nameEn: 'Syncopated Feel',
    difficulty: 'medium',
    beats: ['two-eighths', 'quarter', 'two-eighths', 'quarter-rest'],
  },
  {
    id: 'm3',
    nameEl: 'Ροή Ογδόων',
    nameEn: 'Continuous Eighths',
    difficulty: 'medium',
    beats: ['two-eighths', 'two-eighths', 'quarter', 'quarter'],
  },
  // Hard: Incorporates Triplets & Mixed patterns
  {
    id: 'h1',
    nameEl: 'Τρίηχο & Όγδοα',
    nameEn: 'Triplet & Eighths',
    difficulty: 'hard',
    beats: ['quarter', 'triplet', 'two-eighths', 'quarter'],
  },
  {
    id: 'h2',
    nameEl: 'Πολυρρυθμικό Τρίηχο',
    nameEn: 'Polyrhythmic Triplet',
    difficulty: 'hard',
    beats: ['triplet', 'quarter', 'triplet', 'quarter-rest'],
  },
  {
    id: 'h3',
    nameEl: 'Σύνθετο Τρίηχο & Όγδοα',
    nameEn: 'Complex Groove',
    difficulty: 'hard',
    beats: ['two-eighths', 'triplet', 'quarter', 'two-eighths'],
  },
];

@Component({
  selector: 'app-rhythm-dictation',
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-ink">Ρυθμική Υπαγόρευση (Rhythm Dictation)</h3>
          <p class="mt-0.5 text-[12px] text-ink-3">
            Ακούστε το ρυθμικό μοτίβο σε 4/4 μέτρο και καταγράψτε τις αξίες
          </p>
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

      <!-- Difficulty Tabs & Tempo -->
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div class="flex gap-2">
          <button
            type="button"
            class="btn btn-sm"
            [class.btn-primary]="difficulty() === 'easy'"
            [class.btn-secondary]="difficulty() !== 'easy'"
            (click)="setDifficulty('easy')"
          >
            Εύκολο (♩ & 𝄽)
          </button>
          <button
            type="button"
            class="btn btn-sm"
            [class.btn-primary]="difficulty() === 'medium'"
            [class.btn-secondary]="difficulty() !== 'medium'"
            (click)="setDifficulty('medium')"
          >
            Μεσαίο (+ ♫)
          </button>
          <button
            type="button"
            class="btn btn-sm"
            [class.btn-primary]="difficulty() === 'hard'"
            [class.btn-secondary]="difficulty() !== 'hard'"
            (click)="setDifficulty('hard')"
          >
            Προχωρημένο (+ 3)
          </button>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[12px] font-medium text-ink-2">Tempo: {{ bpm() }} BPM</span>
          <input
            type="range"
            min="60"
            max="130"
            step="5"
            [value]="bpm()"
            (input)="onBpmChange($event)"
            class="h-1.5 w-24 cursor-pointer accent-accent"
          />
        </div>
      </div>

      <!-- Playback Transport -->
      <div class="mt-4 flex flex-col items-center justify-center rounded-xl bg-surface-2 border border-border p-5 text-center">
        <div class="flex items-center gap-4">
          <button
            type="button"
            class="btn btn-primary flex items-center gap-2 px-5 py-2.5 shadow-sm"
            [disabled]="isPlaying()"
            (click)="playPattern()"
          >
            <app-icon [name]="isPlaying() ? 'loader' : 'play'" [size]="18" />
            <span>{{ isPlaying() ? (countIn() ? 'Προμέτρηση...' : 'Αναπαραγωγή...') : 'Ακρόαση Ρυθμού' }}</span>
          </button>

          <button
            type="button"
            class="btn btn-secondary flex items-center gap-1.5"
            [disabled]="isPlaying()"
            (click)="nextPattern()"
          >
            <app-icon name="sparkles" [size]="14" />
            <span>Νέο Μοτίβο</span>
          </button>
        </div>

        <!-- Beat Visualizer Animation during Playback -->
        <div class="mt-4 flex items-center gap-3">
          @for (b of [0, 1, 2, 3]; track b) {
            <div
              class="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-border text-sm font-bold transition-all duration-150"
              [class.bg-accent]="activePlaybackBeat() === b"
              [class.text-white]="activePlaybackBeat() === b"
              [class.scale-105]="activePlaybackBeat() === b"
              [class.bg-surface]="activePlaybackBeat() !== b"
            >
              <span>{{ b + 1 }}</span>
              <span class="text-[10px] font-normal opacity-70">Χρόνος</span>
            </div>
          }
        </div>
        <p class="mt-2 text-[11.5px] text-ink-3">
          Ακούστε 4 χρόνους προμέτρησης και αμέσως μετά το ρυθμικό μοτίβο ενός μέτρου 4/4
        </p>
      </div>

      <!-- Student Input: 4 Beat Slots -->
      <div class="mt-5">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-ink-2">
            Η Απάντησή Σας (4 Χρόνοι):
          </h4>
          <button
            type="button"
            class="text-[12px] text-accent hover:underline"
            [disabled]="submitted() || studentBeats().length === 0"
            (click)="clearStudentBeats()"
          >
            Καθαρισμός
          </button>
        </div>

        <div class="mt-3 grid grid-cols-4 gap-3">
          @for (slot of [0, 1, 2, 3]; track slot) {
            <div
              class="relative flex min-h-[90px] flex-col items-center justify-center rounded-xl border-2 transition-all p-3"
              [class.border-accent]="selectedSlotIndex() === slot && !submitted()"
              [class.border-border]="selectedSlotIndex() !== slot && !submitted()"
              [class.border-emerald-500]="submitted() && isSlotCorrect(slot)"
              [class.bg-emerald-50]="submitted() && isSlotCorrect(slot)"
              [class.dark:bg-emerald-950/20]="submitted() && isSlotCorrect(slot)"
              [class.border-rose-500]="submitted() && !isSlotCorrect(slot)"
              [class.bg-rose-50]="submitted() && !isSlotCorrect(slot)"
              [class.dark:bg-rose-950/20]="submitted() && !isSlotCorrect(slot)"
              (click)="selectSlot(slot)"
            >
              <span class="absolute top-1 left-2 text-[10px] font-bold text-ink-3">
                Χρόνος {{ slot + 1 }}
              </span>

              @if (studentBeats()[slot]; as item) {
                <span class="text-2xl font-bold mt-1 text-ink">{{ noteDefs[item].symbol }}</span>
                <span class="text-[11px] text-ink-2 mt-0.5">{{ noteDefs[item].labelEl }}</span>
              } @else {
                <span class="text-xs italic text-ink-3">Κενό</span>
              }

              @if (submitted()) {
                <div class="mt-1 flex items-center gap-1 text-[11px] font-bold">
                  @if (isSlotCorrect(slot)) {
                    <span class="text-emerald-600">✓ Σωστό</span>
                  } @else {
                    <span class="text-rose-600">✗ ({{ noteDefs[currentPattern().beats[slot]].symbol }})</span>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Note Entry Palette -->
      <div class="mt-5 rounded-xl border border-border bg-surface p-4">
        <p class="text-xs font-semibold uppercase tracking-wider text-ink-3 mb-3">
          Επιλέξτε Ρυθμική Αξία για τον Χρόνο {{ selectedSlotIndex() + 1 }}:
        </p>

        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2.5 text-left hover:border-accent hover:bg-surface transition-colors"
            [disabled]="submitted()"
            (click)="insertNote('quarter')"
          >
            <span class="text-2xl font-bold">♩</span>
            <div>
              <p class="text-xs font-semibold text-ink">Τέταρτο</p>
              <p class="text-[10px] text-ink-3">1 Χρόνος</p>
            </div>
          </button>

          <button
            type="button"
            class="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2.5 text-left hover:border-accent hover:bg-surface transition-colors"
            [disabled]="submitted()"
            (click)="insertNote('two-eighths')"
          >
            <span class="text-2xl font-bold">♫</span>
            <div>
              <p class="text-xs font-semibold text-ink">Δύο Όγδοα</p>
              <p class="text-[10px] text-ink-3">2 x 0.5 Χρόνοι</p>
            </div>
          </button>

          <button
            type="button"
            class="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2.5 text-left hover:border-accent hover:bg-surface transition-colors"
            [disabled]="submitted()"
            (click)="insertNote('quarter-rest')"
          >
            <span class="text-2xl font-bold">𝄽</span>
            <div>
              <p class="text-xs font-semibold text-ink">Παύση Τετάρτου</p>
              <p class="text-[10px] text-ink-3">1 Χρόνος Σιωπής</p>
            </div>
          </button>

          <button
            type="button"
            class="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2.5 text-left hover:border-accent hover:bg-surface transition-colors"
            [disabled]="submitted() || difficulty() === 'easy'"
            (click)="insertNote('triplet')"
          >
            <span class="text-xl font-bold">𝅘𝅥𝅯3𝅘𝅥𝅯</span>
            <div>
              <p class="text-xs font-semibold text-ink">Τρίηχο Ογδόων</p>
              <p class="text-[10px] text-ink-3">3 νότες σε 1 Χρόνο</p>
            </div>
          </button>
        </div>
      </div>

      <!-- Action Buttons & Feedback Banner -->
      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="studentBeats().length < 4 || submitted()"
            (click)="submitAnswer()"
          >
            Έλεγχος Απάντησης
          </button>

          @if (submitted()) {
            <button
              type="button"
              class="btn btn-secondary flex items-center gap-1.5"
              (click)="nextPattern()"
            >
              <span>Επόμενο Μοτίβο</span>
              <app-icon name="arrow-right" [size]="14" />
            </button>
          }
        </div>

        @if (feedback(); as fb) {
          <div
            class="rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
            [class.bg-emerald-100]="fb.correct"
            [class.text-emerald-800]="fb.correct"
            [class.dark:bg-emerald-950/40]="fb.correct"
            [class.dark:text-emerald-300]="fb.correct"
            [class.bg-rose-100]="!fb.correct"
            [class.text-rose-800]="!fb.correct"
            [class.dark:bg-rose-950/40]="!fb.correct"
            [class.dark:text-rose-300]="!fb.correct"
          >
            <app-icon [name]="fb.correct ? 'badge-check' : 'alert-circle'" [size]="14" />
            <span>{{ fb.text }}</span>
          </div>
        }
      </div>
    </section>
  `,
})
export class RhythmDictationComponent implements OnDestroy {
  readonly noteDefs = NOTE_DEFINITIONS;

  readonly difficulty = signal<'easy' | 'medium' | 'hard'>('easy');
  readonly bpm = signal<number>(85);
  readonly isPlaying = signal<boolean>(false);
  readonly countIn = signal<boolean>(false);
  readonly activePlaybackBeat = signal<number | null>(null);

  readonly currentPattern = signal<RhythmPattern>(this.pickRandomPattern('easy'));
  readonly studentBeats = signal<(RhythmNoteType | null)[]>([null, null, null, null]);
  readonly selectedSlotIndex = signal<number>(0);
  readonly submitted = signal<boolean>(false);

  readonly correct = signal<number>(0);
  readonly total = signal<number>(0);
  readonly streak = signal<number>(0);
  readonly feedback = signal<{ correct: boolean; text: string } | null>(null);

  readonly accuracy = computed(() => {
    const t = this.total();
    return t > 0 ? Math.round((this.correct() / t) * 100) : 0;
  });

  private audioCtx: AudioContext | null = null;
  private playbackTimeouts: number[] = [];

  ngOnDestroy(): void {
    this.clearTimeouts();
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  setDifficulty(diff: 'easy' | 'medium' | 'hard'): void {
    this.difficulty.set(diff);
    this.nextPattern();
  }

  onBpmChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.bpm.set(Number(target.value));
  }

  selectSlot(index: number): void {
    if (!this.submitted()) {
      this.selectedSlotIndex.set(index);
    }
  }

  insertNote(type: RhythmNoteType): void {
    const curr = [...this.studentBeats()];
    const idx = this.selectedSlotIndex();
    curr[idx] = type;
    this.studentBeats.set(curr);

    // Auto-advance to next empty or next slot
    if (idx < 3) {
      this.selectedSlotIndex.set(idx + 1);
    }
  }

  clearStudentBeats(): void {
    this.studentBeats.set([null, null, null, null]);
    this.selectedSlotIndex.set(0);
    this.submitted.set(false);
    this.feedback.set(null);
  }

  nextPattern(): void {
    this.clearTimeouts();
    this.isPlaying.set(false);
    this.countIn.set(false);
    this.activePlaybackBeat.set(null);
    this.currentPattern.set(this.pickRandomPattern(this.difficulty()));
    this.clearStudentBeats();
  }

  isSlotCorrect(slotIndex: number): boolean {
    const actual = this.currentPattern().beats[slotIndex];
    const user = this.studentBeats()[slotIndex];
    return actual === user;
  }

  submitAnswer(): void {
    if (this.submitted()) return;
    const pat = this.currentPattern();
    const user = this.studentBeats();

    let allCorrect = true;
    for (let i = 0; i < 4; i++) {
      if (user[i] !== pat.beats[i]) {
        allCorrect = false;
        break;
      }
    }

    this.submitted.set(true);
    this.total.update((t) => t + 1);

    if (allCorrect) {
      this.correct.update((c) => c + 1);
      this.streak.update((s) => s + 1);
      this.feedback.set({
        correct: true,
        text: 'Εξαιρετικά! Καταγράψατε το ρυθμικό μοτίβο με απόλυτη ακρίβεια!',
      });
      this.playSuccessChime();
    } else {
      this.streak.set(0);
      this.feedback.set({
        correct: false,
        text: 'Υπάρχουν λάθη. Ελέγξτε τις διορθώσεις πάνω σε κάθε χρόνο και δοκιμάστε ξανά.',
      });
    }
  }

  playPattern(): void {
    if (this.isPlaying()) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    this.clearTimeouts();
    this.isPlaying.set(true);
    this.countIn.set(true);

    const beatDuration = 60 / this.bpm();
    const pat = this.currentPattern();

    // 4 Count-in clicks
    for (let i = 0; i < 4; i++) {
      const delay = i * beatDuration * 1000;
      const tid = window.setTimeout(() => {
        const isDownbeat = i === 0;
        this.playWoodblock(isDownbeat ? 880 : 660, 0.08);
      }, delay);
      this.playbackTimeouts.push(tid);
    }

    // Pattern playback starts after 4 beats
    const patternStartTime = 4 * beatDuration * 1000;
    const tidStart = window.setTimeout(() => {
      this.countIn.set(false);

      for (let beat = 0; beat < 4; beat++) {
        const noteType = pat.beats[beat];
        const beatOffset = beat * beatDuration * 1000;

        // Visual highlighter
        const beatTid = window.setTimeout(() => {
          this.activePlaybackBeat.set(beat);
        }, beatOffset);
        this.playbackTimeouts.push(beatTid);

        // Sound triggers based on rhythm type
        if (noteType === 'quarter') {
          const soundTid = window.setTimeout(() => {
            this.playRimClick(520, 0.12);
          }, beatOffset);
          this.playbackTimeouts.push(soundTid);
        } else if (noteType === 'two-eighths') {
          // Beat pulse
          const sound1 = window.setTimeout(() => {
            this.playRimClick(520, 0.09);
          }, beatOffset);
          // Offbeat pulse (half-beat later)
          const sound2 = window.setTimeout(() => {
            this.playRimClick(480, 0.09);
          }, beatOffset + (beatDuration * 1000) / 2);
          this.playbackTimeouts.push(sound1, sound2);
        } else if (noteType === 'triplet') {
          // 3 sub-pulses
          const tripletDuration = (beatDuration * 1000) / 3;
          for (let trip = 0; trip < 3; trip++) {
            const tripTid = window.setTimeout(() => {
              this.playRimClick(trip === 0 ? 540 : 490, 0.07);
            }, beatOffset + trip * tripletDuration);
            this.playbackTimeouts.push(tripTid);
          }
        } else if (noteType === 'quarter-rest') {
          // silence!
        }
      }

      // Finish playback
      const endTid = window.setTimeout(() => {
        this.isPlaying.set(false);
        this.activePlaybackBeat.set(null);
      }, 4 * beatDuration * 1000);
      this.playbackTimeouts.push(endTid);
    }, patternStartTime);

    this.playbackTimeouts.push(tidStart);
  }

  private pickRandomPattern(diff: 'easy' | 'medium' | 'hard'): RhythmPattern {
    const list = PATTERNS.filter((p) => p.difficulty === diff);
    return list[Math.floor(Math.random() * list.length)];
  }

  private clearTimeouts(): void {
    for (const id of this.playbackTimeouts) {
      clearTimeout(id);
    }
    this.playbackTimeouts = [];
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  private playWoodblock(freq: number, duration: number): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  private playRimClick(freq: number, duration: number): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, ctx.currentTime + duration);

    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  private playSuccessChime(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.2, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.3);
    });
  }
}
