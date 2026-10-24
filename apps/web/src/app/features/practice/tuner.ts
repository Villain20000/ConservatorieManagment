import { ChangeDetectionStrategy, Component, OnDestroy, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Instrument tuner. Fully client-side: microphone samples are analysed with
 * autocorrelation in this page and never uploaded anywhere.
 */
@Component({
  selector: 'app-tuner',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card p-5">
      <h3 class="text-sm font-semibold">{{ 'practice.tuner.title' | transloco }}</h3>
      <p class="mt-0.5 text-[12px] text-ink-3">{{ 'practice.tuner.subtitle' | transloco }}</p>

      <div class="mt-4 rounded-2xl border border-line bg-surface-2 p-4 text-center">
        @if (note()) {
          <p class="text-4xl font-semibold tracking-tight">
            {{ note() }}<span class="text-lg text-ink-3">{{ octave() }}</span>
          </p>
          <p class="mt-1 text-[12px] font-semibold tabular-nums" [class]="centsClass()">
            {{ centsLabel() }}
          </p>
          <div class="relative mx-auto mt-3 h-1.5 max-w-[220px] rounded-full bg-line">
            <div
              class="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#b9893d]"
              [style.left.%]="needle()"
            ></div>
          </div>
          <p class="mt-2 text-[11px] text-ink-3">{{ 'practice.tuner.listening' | transloco }}</p>
        } @else {
          <p class="py-4 text-[13px] text-ink-3">
            {{ error() ?? ('practice.tuner.idle' | transloco) }}
          </p>
        }
      </div>

      <button
        type="button"
        class="btn mt-4 w-full"
        [class.btn-primary]="!listening()"
        [class.btn-secondary]="listening()"
        (click)="toggle()"
      >
        {{ (listening() ? 'practice.tuner.stop' : 'practice.tuner.start') | transloco }}
      </button>
    </section>
  `,
})
export class TunerComponent implements OnDestroy {
  readonly listening = signal(false);
  readonly note = signal<string | null>(null);
  readonly octave = signal<number | null>(null);
  readonly cents = signal(0);
  readonly error = signal<string | null>(null);

  readonly needle = () => Math.min(100, Math.max(0, 50 + this.cents() / 2));
  readonly centsLabel = () => {
    const value = Math.round(this.cents());
    if (Math.abs(value) < 5) return '✓ 0¢';
    return `${value > 0 ? '+' : ''}${value}¢`;
  };
  readonly centsClass = () =>
    Math.abs(this.cents()) < 5 ? 'text-[#2f7d5d]' : 'text-ink-2';

  private audio: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private buffer: Float32Array<ArrayBuffer> = new Float32Array(2048);

  toggle(): void {
    if (this.listening()) this.stop();
    else void this.start();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private async start(): Promise<void> {
    this.error.set(null);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch {
      this.error.set('practice.tuner.denied');
      return;
    }
    try {
      this.audio ??= new AudioContext();
      await this.audio.resume();
      const source = this.audio.createMediaStreamSource(this.stream);
      this.analyser = this.audio.createAnalyser();
      this.analyser.fftSize = 2048;
      this.buffer = new Float32Array(this.analyser.fftSize);
      source.connect(this.analyser);
      this.listening.set(true);
      this.loop();
    } catch {
      this.error.set('practice.tuner.unavailable');
      this.stop();
    }
  }

  private stop(): void {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.analyser = null;
    this.listening.set(false);
    this.note.set(null);
  }

  private loop(): void {
    if (!this.listening() || !this.analyser || !this.audio) return;
    this.analyser.getFloatTimeDomainData(this.buffer);
    const frequency = this.autocorrelate(this.buffer, this.audio.sampleRate);
    if (frequency > 0) {
      const midi = 69 + 12 * Math.log2(frequency / 440);
      const rounded = Math.round(midi);
      this.note.set(NOTES[((rounded % 12) + 12) % 12]);
      this.octave.set(Math.floor(rounded / 12) - 1);
      this.cents.set((midi - rounded) * 100);
    }
    this.raf = requestAnimationFrame(() => this.loop());
  }

  private autocorrelate(buffer: Float32Array<ArrayBufferLike>, sampleRate: number): number {
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / buffer.length);
    if (rms < 0.01) return -1;
    let bestOffset = -1;
    let bestCorrelation = 0;
    for (let offset = 8; offset < buffer.length / 2; offset++) {
      let correlation = 0;
      for (let i = 0; i < buffer.length / 2; i++) {
        correlation += buffer[i] * buffer[i + offset];
      }
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    }
    return bestOffset > 0 ? sampleRate / bestOffset : -1;
  }
}
