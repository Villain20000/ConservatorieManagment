import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../shared/ui/icon';

export interface PresetTrack {
  id: string;
  title: string;
  composer: string;
  durationSec: number;
  notes: { pitch: number; start: number; duration: number }[];
}

// Built-in synthesized classical practice passages
const PRESET_TRACKS: PresetTrack[] = [
  {
    id: 'bach-minuet',
    title: 'Minuet in G major (BWV Anh. 114) — Bars 1-8',
    composer: 'J.S. Bach',
    durationSec: 12,
    notes: [
      { pitch: 392.0, start: 0.0, duration: 0.5 }, // D5
      { pitch: 293.66, start: 0.5, duration: 0.25 }, // G4
      { pitch: 329.63, start: 0.75, duration: 0.25 }, // A4
      { pitch: 369.99, start: 1.0, duration: 0.25 }, // B4
      { pitch: 392.0, start: 1.25, duration: 0.25 }, // C5
      { pitch: 440.0, start: 1.5, duration: 0.5 }, // D5
      { pitch: 293.66, start: 2.0, duration: 0.5 }, // G4
      { pitch: 293.66, start: 2.5, duration: 0.5 }, // G4
      { pitch: 440.0, start: 3.0, duration: 0.5 }, // E5
      { pitch: 392.0, start: 3.5, duration: 0.25 }, // C5
      { pitch: 440.0, start: 3.75, duration: 0.25 }, // D5
      { pitch: 493.88, start: 4.0, duration: 0.25 }, // E5
      { pitch: 523.25, start: 4.25, duration: 0.25 }, // F#5
      { pitch: 587.33, start: 4.5, duration: 0.5 }, // G5
      { pitch: 293.66, start: 5.0, duration: 0.5 }, // G4
      { pitch: 293.66, start: 5.5, duration: 0.5 }, // G4
      { pitch: 392.0, start: 6.0, duration: 0.5 }, // C5
      { pitch: 440.0, start: 6.5, duration: 0.25 }, // D5
      { pitch: 392.0, start: 6.75, duration: 0.25 }, // C5
      { pitch: 369.99, start: 7.0, duration: 0.25 }, // B4
      { pitch: 329.63, start: 7.25, duration: 0.25 }, // A4
      { pitch: 369.99, start: 7.5, duration: 0.5 }, // B4
      { pitch: 392.0, start: 8.0, duration: 0.25 }, // C5
      { pitch: 369.99, start: 8.25, duration: 0.25 }, // B4
      { pitch: 329.63, start: 8.5, duration: 0.25 }, // A4
      { pitch: 293.66, start: 8.75, duration: 0.25 }, // G4
      { pitch: 329.63, start: 9.0, duration: 0.5 }, // F#4
      { pitch: 293.66, start: 9.5, duration: 0.5 }, // G4
      { pitch: 329.63, start: 10.0, duration: 0.5 }, // A4
      { pitch: 293.66, start: 10.5, duration: 1.0 }, // D4
    ],
  },
  {
    id: 'mozart-k545',
    title: 'Sonata Facile (K. 545) — 1st Mvt Theme',
    composer: 'W.A. Mozart',
    durationSec: 10,
    notes: [
      { pitch: 523.25, start: 0.0, duration: 0.8 }, // C5
      { pitch: 659.25, start: 0.8, duration: 0.8 }, // E5
      { pitch: 783.99, start: 1.6, duration: 0.8 }, // G5
      { pitch: 739.99, start: 2.4, duration: 0.6 }, // B4
      { pitch: 783.99, start: 3.0, duration: 0.2 }, // C5
      { pitch: 739.99, start: 3.2, duration: 0.2 }, // D5
      { pitch: 783.99, start: 3.4, duration: 0.4 }, // C5
      { pitch: 880.0, start: 4.0, duration: 0.8 }, // A5
      { pitch: 783.99, start: 4.8, duration: 0.8 }, // G5
      { pitch: 659.25, start: 5.6, duration: 0.8 }, // C5
      { pitch: 783.99, start: 6.4, duration: 0.8 }, // G4
      { pitch: 698.46, start: 7.2, duration: 0.6 }, // F5
      { pitch: 659.25, start: 7.8, duration: 0.2 }, // E5
      { pitch: 587.33, start: 8.0, duration: 0.8 }, // D5
      { pitch: 523.25, start: 8.8, duration: 1.2 }, // C5
    ],
  },
  {
    id: 'hanon-1',
    title: 'The Virtuoso Pianist — Exercise No. 1',
    composer: 'C.L. Hanon',
    durationSec: 8,
    notes: [
      { pitch: 261.63, start: 0.0, duration: 0.25 }, // C4
      { pitch: 329.63, start: 0.25, duration: 0.25 }, // E4
      { pitch: 349.23, start: 0.5, duration: 0.25 }, // F4
      { pitch: 392.0, start: 0.75, duration: 0.25 }, // G4
      { pitch: 440.0, start: 1.0, duration: 0.25 }, // A4
      { pitch: 392.0, start: 1.25, duration: 0.25 }, // G4
      { pitch: 349.23, start: 1.5, duration: 0.25 }, // F4
      { pitch: 329.63, start: 1.75, duration: 0.25 }, // E4
      { pitch: 293.66, start: 2.0, duration: 0.25 }, // D4
      { pitch: 349.23, start: 2.25, duration: 0.25 }, // F4
      { pitch: 392.0, start: 2.5, duration: 0.25 }, // G4
      { pitch: 440.0, start: 2.75, duration: 0.25 }, // A4
      { pitch: 493.88, start: 3.0, duration: 0.25 }, // B4
      { pitch: 440.0, start: 3.25, duration: 0.25 }, // A4
      { pitch: 392.0, start: 3.5, duration: 0.25 }, // G4
      { pitch: 349.23, start: 3.75, duration: 0.25 }, // F4
      { pitch: 329.63, start: 4.0, duration: 0.25 }, // E4
      { pitch: 392.0, start: 4.25, duration: 0.25 }, // G4
      { pitch: 440.0, start: 4.5, duration: 0.25 }, // A4
      { pitch: 493.88, start: 4.75, duration: 0.25 }, // B4
      { pitch: 523.25, start: 5.0, duration: 0.25 }, // C5
      { pitch: 493.88, start: 5.25, duration: 0.25 }, // B4
      { pitch: 440.0, start: 5.5, duration: 0.25 }, // A4
      { pitch: 392.0, start: 5.75, duration: 0.25 }, // G4
    ],
  },
];

@Component({
  selector: 'app-ab-looper',
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-ink">Εργαλείο Επανάληψης Α/Β (A/B Looper)</h3>
          <p class="mt-0.5 text-[12px] text-ink-3">
            Απομονώστε δύσκολα μουσικά μέτρα, ρυθμίστε την ταχύτητα και εξασκηθείτε σε συνεχή επανάληψη
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold tabular-nums text-accent">
            Επαναλήψεις: {{ repeatCount() }}
          </span>
        </div>
      </div>

      <!-- Track Selector & Custom Audio Upload -->
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div class="flex flex-wrap items-center gap-2">
          <label class="text-xs font-semibold text-ink-2">Επιλογή Κομματιού:</label>
          <select
            class="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink outline-none focus:border-accent"
            [value]="selectedTrackId()"
            (change)="onTrackChange($event)"
          >
            @for (track of presets; track track.id) {
              <option [value]="track.id">{{ track.composer }}: {{ track.title }}</option>
            }
          </select>
        </div>

        <div class="flex items-center gap-2">
          <label
            class="btn btn-secondary btn-sm flex cursor-pointer items-center gap-1.5"
            title="Φορτώστε δικό σας αρχείο ήχου"
          >
            <app-icon name="upload" [size]="14" />
            <span>Φόρτωση Audio</span>
            <input
              #audioFileInput
              type="file"
              accept="audio/*"
              class="hidden"
              (change)="onCustomAudioLoaded($event)"
            />
          </label>
          @if (isCustomAudio()) {
            <span class="text-xs text-ink-3 italic truncate max-w-[140px]">{{ customFileName() }}</span>
          }
        </div>
      </div>

      <!-- Hidden HTML5 Audio Element for custom uploads -->
      <audio #audioPlayer class="hidden"></audio>

      <!-- Waveform / Interactive Timeline Track -->
      <div class="mt-5 rounded-xl border border-border bg-surface-2 p-4">
        <div class="flex items-center justify-between text-xs font-semibold text-ink-3 mb-2">
          <span>00:00</span>
          <span class="text-ink font-bold">{{ formatTime(currentTime()) }} / {{ formatTime(totalDuration()) }}</span>
          <span>{{ formatTime(totalDuration()) }}</span>
        </div>

        <!-- Visual Bar Track with Markers -->
        <div
          class="relative h-12 w-full cursor-pointer rounded-lg bg-surface border border-border overflow-hidden select-none"
          (click)="onTrackClick($event)"
        >
          <!-- Loop Highlight Area between A and B -->
          <div
            class="absolute top-0 bottom-0 bg-accent/20 border-x-2 border-accent transition-all"
            [style.left.%]="(pointA() / totalDuration()) * 100"
            [style.width.%]="((pointB() - pointA()) / totalDuration()) * 100"
          ></div>

          <!-- Current Playhead -->
          <div
            class="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10 transition-all duration-75 shadow-sm"
            [style.left.%]="(currentTime() / totalDuration()) * 100"
          >
            <div class="h-2 w-2 -ml-[3px] bg-rose-500 rounded-full"></div>
          </div>

          <!-- Simulated Waveform Bars -->
          <div class="flex h-full items-center justify-between px-2 opacity-30 pointer-events-none">
            @for (bar of waveformBars; track $index) {
              <div
                class="w-1 bg-ink rounded-full"
                [style.height.%]="bar"
              ></div>
            }
          </div>
        </div>

        <!-- Marker A & B Control Buttons -->
        <div class="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn btn-sm flex items-center gap-1 font-bold text-accent border-accent/40 hover:bg-accent/10"
              (click)="setPointA()"
            >
              <span>Ορισμός Σημείου [A]:</span>
              <span class="tabular-nums font-mono">{{ formatTime(pointA()) }}</span>
            </button>

            <button
              type="button"
              class="btn btn-sm flex items-center gap-1 font-bold text-accent border-accent/40 hover:bg-accent/10"
              (click)="setPointB()"
            >
              <span>Ορισμός Σημείου [B]:</span>
              <span class="tabular-nums font-mono">{{ formatTime(pointB()) }}</span>
            </button>

            <button
              type="button"
              class="btn-ghost btn-sm text-ink-3 hover:text-ink"
              (click)="resetPoints()"
            >
              Επαναφορά Ολόκληρου
            </button>
          </div>

          <div class="text-[11.5px] text-ink-3">
            Διάρκεια Loop: <strong class="text-ink tabular-nums">{{ (pointB() - pointA()).toFixed(1) }}s</strong>
          </div>
        </div>
      </div>

      <!-- Playback Transport, Speed & Count-in Controls -->
      <div class="mt-5 grid grid-cols-1 md:grid-cols-3 items-center gap-4 border-t border-border pt-4">
        <!-- Transport Buttons -->
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn btn-primary flex items-center gap-2 px-5 py-2.5 shadow-sm"
            (click)="togglePlay()"
          >
            <app-icon [name]="isPlaying() ? 'pause' : 'play'" [size]="18" />
            <span>{{ isPlaying() ? 'Παύση' : 'Επανάληψη Loop' }}</span>
          </button>

          <button
            type="button"
            class="btn btn-secondary flex items-center gap-1.5"
            (click)="stop()"
          >
            <app-icon name="rotate-ccw" [size]="14" />
            <span>Reset</span>
          </button>
        </div>

        <!-- Speed Rate Slider -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-xs font-semibold text-ink-2">
            <span>Ταχύτητα Μελέτης:</span>
            <span class="text-accent font-bold tabular-nums">{{ speedPercent() }}%</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-ink-3">50%</span>
            <input
              type="range"
              min="50"
              max="120"
              step="5"
              [value]="speedPercent()"
              (input)="onSpeedChange($event)"
              class="h-1.5 w-full cursor-pointer accent-accent"
            />
            <span class="text-[11px] text-ink-3">120%</span>
          </div>
        </div>

        <!-- Count-In Metronome & Practice Log Link -->
        <div class="flex items-center justify-end gap-3">
          <label class="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink-2">
            <input
              type="checkbox"
              [checked]="countInEnabled()"
              (change)="countInEnabled.set(!countInEnabled())"
              class="rounded border-border text-accent focus:ring-accent"
            />
            <span>Προμέτρηση (Count-in)</span>
          </label>
        </div>
      </div>
    </section>
  `,
})
export class AbLooperComponent implements OnDestroy {
  @ViewChild('audioPlayer') audioPlayerRef?: ElementRef<HTMLAudioElement>;

  readonly presets = PRESET_TRACKS;
  readonly selectedTrackId = signal<string>(PRESET_TRACKS[0].id);

  readonly isCustomAudio = signal<boolean>(false);
  readonly customFileName = signal<string>('');

  readonly totalDuration = signal<number>(PRESET_TRACKS[0].durationSec);
  readonly currentTime = signal<number>(0);
  readonly pointA = signal<number>(0);
  readonly pointB = signal<number>(4.0); // Default 4 second loop

  readonly speedPercent = signal<number>(100);
  readonly isPlaying = signal<boolean>(false);
  readonly repeatCount = signal<number>(0);
  readonly countInEnabled = signal<boolean>(true);

  // Decorative waveform amplitudes
  readonly waveformBars = [
    40, 60, 30, 80, 95, 50, 45, 70, 85, 30, 65, 90, 75, 40, 55, 80, 60, 35, 90, 100,
    70, 45, 60, 85, 40, 75, 90, 65, 50, 80, 40, 70, 85, 60, 30, 95, 55, 75, 40, 80,
  ];

  private audioCtx: AudioContext | null = null;
  private animFrameId: number | null = null;
  private loopIntervalId: number | null = null;
  private playStartTime = 0;
  private activeOscillators: { osc: OscillatorNode; gain: GainNode }[] = [];

  ngOnDestroy(): void {
    this.stop();
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  onTrackChange(event: Event): void {
    const sel = event.target as HTMLSelectElement;
    const track = this.presets.find((p) => p.id === sel.value);
    if (!track) return;

    this.stop();
    this.isCustomAudio.set(false);
    this.selectedTrackId.set(track.id);
    this.totalDuration.set(track.durationSec);
    this.pointA.set(0);
    this.pointB.set(Math.min(4.0, track.durationSec));
    this.currentTime.set(0);
  }

  onCustomAudioLoaded(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.audioPlayerRef) return;

    this.stop();
    const url = URL.createObjectURL(file);
    const player = this.audioPlayerRef.nativeElement;
    player.src = url;

    player.onloadedmetadata = () => {
      this.isCustomAudio.set(true);
      this.customFileName.set(file.name);
      this.totalDuration.set(player.duration || 10);
      this.pointA.set(0);
      this.pointB.set(Math.min(5.0, player.duration || 10));
      this.currentTime.set(0);
    };
  }

  setPointA(): void {
    const cur = this.currentTime();
    if (cur < this.pointB()) {
      this.pointA.set(cur);
    }
  }

  setPointB(): void {
    const cur = this.currentTime();
    if (cur > this.pointA()) {
      this.pointB.set(cur);
    }
  }

  resetPoints(): void {
    this.pointA.set(0);
    this.pointB.set(this.totalDuration());
  }

  onTrackClick(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const seekTime = ratio * this.totalDuration();
    this.currentTime.set(seekTime);

    if (this.isCustomAudio() && this.audioPlayerRef) {
      this.audioPlayerRef.nativeElement.currentTime = seekTime;
    }
  }

  onSpeedChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = Number(input.value);
    this.speedPercent.set(val);

    if (this.isCustomAudio() && this.audioPlayerRef) {
      this.audioPlayerRef.nativeElement.playbackRate = val / 100;
    }
  }

  togglePlay(): void {
    if (this.isPlaying()) {
      this.stop();
    } else {
      this.startLoop();
    }
  }

  startLoop(): void {
    this.isPlaying.set(true);
    this.currentTime.set(this.pointA());

    if (this.isCustomAudio() && this.audioPlayerRef) {
      const player = this.audioPlayerRef.nativeElement;
      player.currentTime = this.pointA();
      player.playbackRate = this.speedPercent() / 100;
      void player.play();
      this.monitorCustomAudioLoop();
    } else {
      this.playSynthesizedLoop();
    }
  }

  stop(): void {
    this.isPlaying.set(false);
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.loopIntervalId) {
      clearInterval(this.loopIntervalId);
      this.loopIntervalId = null;
    }
    if (this.isCustomAudio() && this.audioPlayerRef) {
      this.audioPlayerRef.nativeElement.pause();
    }
    this.stopSynthesizer();
  }

  private monitorCustomAudioLoop(): void {
    if (!this.isPlaying()) return;
    const player = this.audioPlayerRef?.nativeElement;
    if (!player) return;

    this.currentTime.set(player.currentTime);

    if (player.currentTime >= this.pointB()) {
      this.repeatCount.update((c) => c + 1);
      player.currentTime = this.pointA();
      if (this.countInEnabled()) {
        this.playCountInClick();
      }
    }

    this.animFrameId = requestAnimationFrame(() => this.monitorCustomAudioLoop());
  }

  private playSynthesizedLoop(): void {
    const track = this.presets.find((p) => p.id === this.selectedTrackId());
    if (!track) return;

    const start = this.pointA();
    const end = this.pointB();
    const duration = end - start;
    const speedRatio = this.speedPercent() / 100;
    const scaledDurationMs = (duration / speedRatio) * 1000;

    const runIteration = () => {
      if (!this.isPlaying()) return;

      this.playStartTime = performance.now();
      this.currentTime.set(start);

      // Play notes falling within [pointA, pointB]
      const notesInLoop = track.notes.filter(
        (n) => n.start >= start && n.start < end
      );

      for (const n of notesInLoop) {
        const noteDelay = ((n.start - start) / speedRatio) * 1000;
        const noteDuration = n.duration / speedRatio;
        setTimeout(() => {
          if (this.isPlaying()) {
            this.playSynthNote(n.pitch, noteDuration);
          }
        }, noteDelay);
      }

      // Track timeline cursor
      const updateCursor = () => {
        if (!this.isPlaying()) return;
        const elapsed = (performance.now() - this.playStartTime) / 1000;
        const current = start + elapsed * speedRatio;
        if (current <= end) {
          this.currentTime.set(current);
          this.animFrameId = requestAnimationFrame(updateCursor);
        }
      };
      this.animFrameId = requestAnimationFrame(updateCursor);
    };

    // First run
    runIteration();

    // Loop interval
    this.loopIntervalId = window.setInterval(() => {
      if (!this.isPlaying()) return;
      this.repeatCount.update((c) => c + 1);
      if (this.countInEnabled()) {
        this.playCountInClick();
      }
      runIteration();
    }, scaledDurationMs);
  }

  private playSynthNote(pitch: number, duration: number): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, ctx.currentTime);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);

    this.activeOscillators.push({ osc, gain });
    setTimeout(() => {
      const idx = this.activeOscillators.findIndex((o) => o.osc === osc);
      if (idx !== -1) this.activeOscillators.splice(idx, 1);
    }, duration * 1000);
  }

  private stopSynthesizer(): void {
    for (const item of this.activeOscillators) {
      try {
        item.osc.stop();
        item.osc.disconnect();
      } catch {
        // already stopped
      }
    }
    this.activeOscillators = [];
  }

  private playCountInClick(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
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

  formatTime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  }
}
