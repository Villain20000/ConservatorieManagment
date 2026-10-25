import { ChangeDetectionStrategy, Component, OnDestroy, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Practice metronome. Fully client-side: clicks are synthesized with the
 * Web Audio API on this device; no audio or tempo data leaves the browser.
 */
@Component({
  selector: 'app-metronome',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card p-5">
      <h3 class="text-sm font-semibold">{{ 'practice.metronome.title' | transloco }}</h3>
      <p class="mt-0.5 text-[12px] text-ink-3">{{ 'practice.metronome.subtitle' | transloco }}</p>

      <p class="mt-4 text-center text-4xl font-semibold tabular-nums">{{ bpm() }}</p>
      <p class="text-center text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">
        {{ 'practice.metronome.bpm' | transloco }}
      </p>
      <input name="bpm"
        type="range"
        min="40"
        max="208"
        [value]="bpm()"
        (input)="setBpm($any($event.target).value)"
        class="mt-2 w-full accent-[#b9893d]"
        [attr.aria-label]="'practice.metronome.bpm' | transloco" autocomplete="off" />
      <div class="mt-1 flex items-center justify-center gap-1.5">
        <button type="button" class="btn btn-secondary btn-icon" (click)="nudge(-1)" aria-label="-1">
          −
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          (click)="tap()"
          [title]="'practice.metronome.tap' | transloco"
        >
          {{ 'practice.metronome.tap' | transloco }}
        </button>
        <button type="button" class="btn btn-secondary btn-icon" (click)="nudge(1)" aria-label="+1">
          +
        </button>
      </div>

      <div class="mt-4 flex items-center justify-center gap-1.5" role="group">
        @for (option of beatOptions; track option) {
          <button
            type="button"
            class="btn btn-sm"
            [class.btn-primary]="beats() === option"
            [class.btn-secondary]="beats() !== option"
            (click)="beats.set(option)"
          >
            {{ option }}
          </button>
        }
      </div>

      <div class="mt-3 flex justify-center gap-1.5" aria-hidden="true">
        @for (dot of beatDots(); track $index) {
          <span
            class="h-2.5 w-2.5 rounded-full transition-colors"
            [class.bg-[#b9893d]]="$index === currentBeat() && running()"
            [class.bg-line]="!($index === currentBeat() && running())"
          ></span>
        }
      </div>

      <button
        type="button"
        class="btn mt-4 w-full"
        [class.btn-primary]="!running()"
        [class.btn-secondary]="running()"
        (click)="toggle()"
      >
        {{ (running() ? 'practice.metronome.stop' : 'practice.metronome.start') | transloco }}
      </button>
    </section>
  `,
})
export class MetronomeComponent implements OnDestroy {
  readonly bpm = signal(80);
  readonly beats = signal(4);
  readonly running = signal(false);
  readonly currentBeat = signal(0);
  readonly beatOptions = [2, 3, 4, 6];

  readonly beatDots = () => Array.from({ length: this.beats() });

  private audio: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private beat = 0;
  private taps: number[] = [];

  setBpm(value: string | number): void {
    const parsed = Math.round(Number(value));
    if (Number.isFinite(parsed)) {
      this.bpm.set(Math.min(208, Math.max(40, parsed)));
    }
  }

  nudge(delta: number): void {
    this.setBpm(this.bpm() + delta);
  }

  tap(): void {
    const now = performance.now();
    this.taps = [...this.taps.filter((t) => now - t < 3000), now];
    if (this.taps.length >= 2) {
      const intervals = this.taps.slice(1).map((t, i) => t - this.taps[i]);
      const average = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
      this.setBpm(60000 / average);
    }
  }

  toggle(): void {
    if (this.running()) this.stop();
    else void this.start();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private async start(): Promise<void> {
    this.audio ??= new AudioContext();
    await this.audio.resume();
    this.beat = 0;
    this.nextTime = this.audio.currentTime + 0.05;
    this.running.set(true);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running.set(false);
  }

  private schedule(): void {
    if (!this.audio) return;
    const interval = 60 / this.bpm();
    while (this.nextTime < this.audio.currentTime + 0.12) {
      this.click(this.nextTime, this.beat === 0);
      const beatIndex = this.beat;
      const delay = Math.max(0, (this.nextTime - this.audio.currentTime) * 1000);
      setTimeout(() => this.currentBeat.set(beatIndex), delay);
      this.nextTime += interval;
      this.beat = (this.beat + 1) % this.beats();
    }
  }

  private click(when: number, accent: boolean): void {
    if (!this.audio) return;
    const osc = this.audio.createOscillator();
    const gain = this.audio.createGain();
    osc.connect(gain);
    gain.connect(this.audio.destination);
    osc.frequency.value = accent ? 1568 : 1046;
    gain.gain.setValueAtTime(0.5, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
    osc.start(when);
    osc.stop(when + 0.07);
  }
}
