import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../shared/ui/icon';

export interface ScoreMeasure {
  number: number;
  notes: {
    pitchName: string;
    freq: number;
    durationBeats: number;
    svgY: number; // Stave position (line/space offset)
    stemUp: boolean;
  }[];
}

export interface ScorePiece {
  id: string;
  title: string;
  composer: string;
  keySignature: string;
  timeSignature: string;
  defaultBpm: number;
  measures: ScoreMeasure[];
  musicXml: string;
}

const SAMPLE_SCORES: ScorePiece[] = [
  {
    id: 'bach-prelude',
    title: 'Prelude in C Major (BWV 846)',
    composer: 'Johann Sebastian Bach',
    keySignature: 'C Major',
    timeSignature: '4/4',
    defaultBpm: 72,
    measures: [
      {
        number: 1,
        notes: [
          { pitchName: 'C4', freq: 261.63, durationBeats: 0.5, svgY: 70, stemUp: true },
          { pitchName: 'E4', freq: 329.63, durationBeats: 0.5, svgY: 60, stemUp: true },
          { pitchName: 'G4', freq: 392.0, durationBeats: 0.5, svgY: 50, stemUp: true },
          { pitchName: 'C5', freq: 523.25, durationBeats: 0.5, svgY: 35, stemUp: false },
          { pitchName: 'E5', freq: 659.25, durationBeats: 0.5, svgY: 25, stemUp: false },
          { pitchName: 'G4', freq: 392.0, durationBeats: 0.5, svgY: 50, stemUp: true },
          { pitchName: 'C5', freq: 523.25, durationBeats: 0.5, svgY: 35, stemUp: false },
          { pitchName: 'E5', freq: 659.25, durationBeats: 0.5, svgY: 25, stemUp: false },
        ],
      },
      {
        number: 2,
        notes: [
          { pitchName: 'C4', freq: 261.63, durationBeats: 0.5, svgY: 70, stemUp: true },
          { pitchName: 'D4', freq: 293.66, durationBeats: 0.5, svgY: 65, stemUp: true },
          { pitchName: 'A4', freq: 440.0, durationBeats: 0.5, svgY: 45, stemUp: true },
          { pitchName: 'D5', freq: 587.33, durationBeats: 0.5, svgY: 30, stemUp: false },
          { pitchName: 'F5', freq: 698.46, durationBeats: 0.5, svgY: 20, stemUp: false },
          { pitchName: 'A4', freq: 440.0, durationBeats: 0.5, svgY: 45, stemUp: true },
          { pitchName: 'D5', freq: 587.33, durationBeats: 0.5, svgY: 30, stemUp: false },
          { pitchName: 'F5', freq: 698.46, durationBeats: 0.5, svgY: 20, stemUp: false },
        ],
      },
      {
        number: 3,
        notes: [
          { pitchName: 'B3', freq: 246.94, durationBeats: 0.5, svgY: 75, stemUp: true },
          { pitchName: 'D4', freq: 293.66, durationBeats: 0.5, svgY: 65, stemUp: true },
          { pitchName: 'G4', freq: 392.0, durationBeats: 0.5, svgY: 50, stemUp: true },
          { pitchName: 'D5', freq: 587.33, durationBeats: 0.5, svgY: 30, stemUp: false },
          { pitchName: 'F5', freq: 698.46, durationBeats: 0.5, svgY: 20, stemUp: false },
          { pitchName: 'G4', freq: 392.0, durationBeats: 0.5, svgY: 50, stemUp: true },
          { pitchName: 'D5', freq: 587.33, durationBeats: 0.5, svgY: 30, stemUp: false },
          { pitchName: 'F5', freq: 698.46, durationBeats: 0.5, svgY: 20, stemUp: false },
        ],
      },
      {
        number: 4,
        notes: [
          { pitchName: 'C4', freq: 261.63, durationBeats: 0.5, svgY: 70, stemUp: true },
          { pitchName: 'E4', freq: 329.63, durationBeats: 0.5, svgY: 60, stemUp: true },
          { pitchName: 'G4', freq: 392.0, durationBeats: 0.5, svgY: 50, stemUp: true },
          { pitchName: 'C5', freq: 523.25, durationBeats: 0.5, svgY: 35, stemUp: false },
          { pitchName: 'E5', freq: 659.25, durationBeats: 0.5, svgY: 25, stemUp: false },
          { pitchName: 'G4', freq: 392.0, durationBeats: 0.5, svgY: 50, stemUp: true },
          { pitchName: 'C5', freq: 523.25, durationBeats: 0.5, svgY: 35, stemUp: false },
          { pitchName: 'E5', freq: 659.25, durationBeats: 0.5, svgY: 25, stemUp: false },
        ],
      },
    ],
    musicXml: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Prelude in C Major</work-title></work>
  <identification><creator type="composer">J.S. Bach (BWV 846)</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`,
  },
  {
    id: 'fur-elise',
    title: 'Für Elise (WoO 59)',
    composer: 'Ludwig van Beethoven',
    keySignature: 'A Minor',
    timeSignature: '3/8',
    defaultBpm: 120,
    measures: [
      {
        number: 1,
        notes: [
          { pitchName: 'E5', freq: 659.25, durationBeats: 0.5, svgY: 25, stemUp: false },
          { pitchName: 'D#5', freq: 622.25, durationBeats: 0.5, svgY: 28, stemUp: false },
          { pitchName: 'E5', freq: 659.25, durationBeats: 0.5, svgY: 25, stemUp: false },
          { pitchName: 'D#5', freq: 622.25, durationBeats: 0.5, svgY: 28, stemUp: false },
          { pitchName: 'E5', freq: 659.25, durationBeats: 0.5, svgY: 25, stemUp: false },
          { pitchName: 'B4', freq: 493.88, durationBeats: 0.5, svgY: 40, stemUp: true },
        ],
      },
      {
        number: 2,
        notes: [
          { pitchName: 'D5', freq: 587.33, durationBeats: 0.5, svgY: 30, stemUp: false },
          { pitchName: 'C5', freq: 523.25, durationBeats: 0.5, svgY: 35, stemUp: false },
          { pitchName: 'A4', freq: 440.0, durationBeats: 1.0, svgY: 45, stemUp: true },
          { pitchName: 'C4', freq: 261.63, durationBeats: 0.5, svgY: 70, stemUp: true },
          { pitchName: 'E4', freq: 329.63, durationBeats: 0.5, svgY: 60, stemUp: true },
          { pitchName: 'A4', freq: 440.0, durationBeats: 0.5, svgY: 45, stemUp: true },
        ],
      },
    ],
    musicXml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Für Elise</work-title></work>
  <identification><creator type="composer">L.v. Beethoven</creator></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><time><beats>3</beats><beat-type>8</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><type>sixteenth</type></note>
      <note><pitch><step>D</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><type>sixteenth</type></note>
    </measure>
  </part>
</score-partwise>`,
  },
];

@Component({
  selector: 'app-musicxml-viewer',
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-ink">Διαδραστική Παρτιτούρα (MusicXML Studio Viewer)</h3>
          <p class="mt-0.5 text-[12px] text-ink-3">
            Προβολή παρτιτούρας με διαδραστική αναπαραγωγή, παρακολούθηση μέτρων & εξαγωγή MusicXML
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn btn-secondary btn-sm flex items-center gap-1.5"
            (click)="showXmlModal.set(true)"
          >
            <app-icon name="code" [size]="14" />
            <span>MusicXML Source</span>
          </button>
        </div>
      </div>

      <!-- Piece Selection & Viewer Controls -->
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div class="flex flex-wrap items-center gap-2">
          <label class="text-xs font-semibold text-ink-2">Παρτιτούρα:</label>
          <select
            class="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink outline-none focus:border-accent"
            [value]="selectedPieceId()"
            (change)="onPieceChange($event)"
          >
            @for (p of pieces; track p.id) {
              <option [value]="p.id">{{ p.composer }}: {{ p.title }}</option>
            }
          </select>
        </div>

        <div class="flex items-center gap-4">
          <!-- Zoom Controls -->
          <div class="flex items-center gap-1 bg-surface-2 rounded-lg border border-border p-1">
            <button
              type="button"
              class="btn-ghost btn-icon-sm"
              (click)="zoomOut()"
              title="Σμίκρυνση"
            >
              <app-icon name="minus" [size]="14" />
            </button>
            <span class="text-xs font-bold tabular-nums px-1 text-ink-2">{{ zoomLevel() }}%</span>
            <button
              type="button"
              class="btn-ghost btn-icon-sm"
              (click)="zoomIn()"
              title="Μεγέθυνση"
            >
              <app-icon name="plus" [size]="14" />
            </button>
          </div>

          <!-- Tempo Slider -->
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-ink-2">Tempo: {{ bpm() }} BPM</span>
            <input
              type="range"
              min="40"
              max="160"
              step="4"
              [value]="bpm()"
              (input)="onBpmChange($event)"
              class="h-1.5 w-20 cursor-pointer accent-accent"
            />
          </div>
        </div>
      </div>

      <!-- Playback Transport Bar -->
      <div class="mt-3 flex items-center gap-3">
        <button
          type="button"
          class="btn btn-primary btn-sm flex items-center gap-1.5"
          (click)="togglePlay()"
        >
          <app-icon [name]="isPlaying() ? 'pause' : 'play'" [size]="14" />
          <span>{{ isPlaying() ? 'Παύση' : 'Αναπαραγωγή Παρτιτούρας' }}</span>
        </button>

        <button
          type="button"
          class="btn btn-secondary btn-sm flex items-center gap-1"
          (click)="rewind()"
        >
          <app-icon name="rotate-ccw" [size]="13" />
          <span>Αρχή</span>
        </button>

        <div class="flex items-center gap-1 text-xs text-ink-3">
          <span>Μέτρο:</span>
          <div class="flex gap-1">
            @for (m of currentPiece().measures; track m.number) {
              <button
                type="button"
                class="h-6 w-6 rounded border text-xs font-bold transition-colors"
                [class.bg-accent]="activeMeasureIndex() === $index"
                [class.text-white]="activeMeasureIndex() === $index"
                [class.border-accent]="activeMeasureIndex() === $index"
                [class.border-border]="activeMeasureIndex() !== $index"
                [class.bg-surface-2]="activeMeasureIndex() !== $index"
                (click)="jumpToMeasure($index)"
              >
                {{ m.number }}
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Sheet Music SVG Notation Render Viewport -->
      <div class="mt-4 overflow-x-auto rounded-xl border border-border bg-white dark:bg-zinc-900 p-6 shadow-inner">
        <div
          class="min-w-[650px] transition-transform origin-top-left"
          [style.transform]="'scale(' + (zoomLevel() / 100) + ')'"
        >
          <!-- Score Title & Header -->
          <div class="text-center mb-6">
            <h2 class="text-lg font-serif font-bold text-zinc-900 dark:text-zinc-100">
              {{ currentPiece().title }}
            </h2>
            <p class="text-xs font-serif italic text-zinc-600 dark:text-zinc-400">
              {{ currentPiece().composer }} · {{ currentPiece().keySignature }} ({{ currentPiece().timeSignature }})
            </p>
          </div>

          <!-- Staves and Measures SVG -->
          <svg viewBox="0 0 800 160" class="w-full h-auto select-none">
            <!-- 5 Stave Lines -->
            @for (y of [30, 40, 50, 60, 70]; track y) {
              <line
                x1="40"
                [attr.y1]="y"
                x2="760"
                [attr.y2]="y"
                stroke="#333333"
                stroke-width="1.2"
              />
            }

            <!-- Start Barline & Treble Clef -->
            <line x1="40" y1="30" x2="40" y2="70" stroke="#333" stroke-width="2.5" />
            <!-- Treble Clef Symbol (text representation) -->
            <text x="46" y="65" font-family="serif" font-size="42" fill="#222" class="select-none">𝄞</text>

            <!-- Time Signature (e.g. 4/4) -->
            <text x="82" y="48" font-family="serif" font-size="20" font-weight="bold" fill="#222">4</text>
            <text x="82" y="68" font-family="serif" font-size="20" font-weight="bold" fill="#222">4</text>

            <!-- Measures Loop -->
            @for (measure of currentPiece().measures; track measure.number; let mIdx = $index) {
              <!-- Measure Bounding Box & Active Highlight -->
              <g [attr.transform]="'translate(' + (110 + mIdx * 155) + ', 0)'">
                @if (activeMeasureIndex() === mIdx) {
                  <rect
                    x="-5"
                    y="15"
                    width="155"
                    height="85"
                    rx="6"
                    fill="rgba(16, 185, 129, 0.12)"
                    stroke="rgb(16, 185, 129)"
                    stroke-width="1.5"
                    stroke-dasharray="3 3"
                  />
                }

                <!-- Measure Number -->
                <text x="0" y="24" font-size="9" font-family="sans-serif" font-weight="bold" fill="#777">
                  {{ measure.number }}
                </text>

                <!-- Measure Notes -->
                @for (note of measure.notes; track $index; let nIdx = $index) {
                  <!-- Active Note Highlight Pulse -->
                  @if (activeMeasureIndex() === mIdx && activeNoteIndex() === nIdx) {
                    <circle
                      [attr.cx]="15 + nIdx * 17"
                      [attr.cy]="note.svgY"
                      r="9"
                      fill="rgba(244, 63, 94, 0.25)"
                    />
                  }

                  <!-- Notehead -->
                  <ellipse
                    [attr.cx]="15 + nIdx * 17"
                    [attr.cy]="note.svgY"
                    rx="5"
                    ry="3.8"
                    transform="rotate(-25)"
                    [attr.transform-origin]="(15 + nIdx * 17) + ' ' + note.svgY"
                    [attr.fill]="(activeMeasureIndex() === mIdx && activeNoteIndex() === nIdx) ? '#e11d48' : '#111827'"
                  />

                  <!-- Stem -->
                  @if (note.stemUp) {
                    <line
                      [attr.x1]="20 + nIdx * 17"
                      [attr.y1]="note.svgY"
                      [attr.x2]="20 + nIdx * 17"
                      [attr.y2]="note.svgY - 26"
                      stroke="#111827"
                      stroke-width="1.3"
                    />
                  } @else {
                    <line
                      [attr.x1]="10 + nIdx * 17"
                      [attr.y1]="note.svgY"
                      [attr.x2]="10 + nIdx * 17"
                      [attr.y2]="note.svgY + 26"
                      stroke="#111827"
                      stroke-width="1.3"
                    />
                  }

                  <!-- Ledger line for C4 (svgY = 70) -->
                  @if (note.svgY >= 70) {
                    <line
                      [attr.x1]="8 + nIdx * 17"
                      y1="70"
                      [attr.x2]="22 + nIdx * 17"
                      y2="70"
                      stroke="#333"
                      stroke-width="1.2"
                    />
                  }
                }

                <!-- End of Measure Barline -->
                <line x1="150" y1="30" x2="150" y2="70" stroke="#444" stroke-width="1.2" />
              </g>
            }

            <!-- Final Double Barline -->
            <line x1="755" y1="30" x2="755" y2="70" stroke="#111" stroke-width="1.2" />
            <line x1="760" y1="30" x2="760" y2="70" stroke="#111" stroke-width="3.5" />
          </svg>
        </div>
      </div>

      <!-- MusicXML Source Modal -->
      @if (showXmlModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div class="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div class="flex items-center justify-between pb-3 border-b border-border">
              <h3 class="text-sm font-bold text-ink">Κώδικας MusicXML (Standard W3C Format)</h3>
              <button type="button" class="btn-ghost btn-icon-sm" (click)="showXmlModal.set(false)">
                <app-icon name="x" [size]="16" />
              </button>
            </div>

            <div class="mt-4 flex-1 overflow-auto rounded-xl bg-zinc-950 p-4 text-[11.5px] font-mono text-emerald-400">
              <pre>{{ currentPiece().musicXml }}</pre>
            </div>

            <div class="mt-4 flex items-center justify-between pt-3 border-t border-border">
              <span class="text-xs text-ink-3">Συμβατό με MuseScore, Sibelius, Dorico & Finale</span>
              <button type="button" class="btn btn-secondary btn-sm" (click)="showXmlModal.set(false)">
                Κλείσιμο
              </button>
            </div>
          </div>
        </div>
      }
    </section>
  `,
})
export class MusicXmlViewerComponent implements OnDestroy {
  readonly pieces = SAMPLE_SCORES;
  readonly selectedPieceId = signal<string>(SAMPLE_SCORES[0].id);
  readonly currentPiece = computed(
    () => this.pieces.find((p) => p.id === this.selectedPieceId()) || this.pieces[0]
  );

  readonly zoomLevel = signal<number>(100);
  readonly bpm = signal<number>(SAMPLE_SCORES[0].defaultBpm);
  readonly isPlaying = signal<boolean>(false);
  readonly activeMeasureIndex = signal<number>(0);
  readonly activeNoteIndex = signal<number | null>(null);
  readonly showXmlModal = signal<boolean>(false);

  private audioCtx: AudioContext | null = null;
  private playbackTimeoutId: number | null = null;

  ngOnDestroy(): void {
    this.stopPlayback();
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  onPieceChange(event: Event): void {
    const sel = event.target as HTMLSelectElement;
    this.stopPlayback();
    this.selectedPieceId.set(sel.value);
    this.bpm.set(this.currentPiece().defaultBpm);
    this.activeMeasureIndex.set(0);
    this.activeNoteIndex.set(null);
  }

  onBpmChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.bpm.set(Number(input.value));
  }

  zoomIn(): void {
    if (this.zoomLevel() < 160) {
      this.zoomLevel.update((z) => z + 15);
    }
  }

  zoomOut(): void {
    if (this.zoomLevel() > 70) {
      this.zoomLevel.update((z) => z - 15);
    }
  }

  jumpToMeasure(index: number): void {
    this.activeMeasureIndex.set(index);
    this.activeNoteIndex.set(null);
  }

  rewind(): void {
    this.stopPlayback();
    this.activeMeasureIndex.set(0);
    this.activeNoteIndex.set(null);
  }

  togglePlay(): void {
    if (this.isPlaying()) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  private startPlayback(): void {
    this.isPlaying.set(true);
    this.playStep(this.activeMeasureIndex(), this.activeNoteIndex() || 0);
  }

  private stopPlayback(): void {
    this.isPlaying.set(false);
    if (this.playbackTimeoutId) {
      clearTimeout(this.playbackTimeoutId);
      this.playbackTimeoutId = null;
    }
  }

  private playStep(mIdx: number, nIdx: number): void {
    if (!this.isPlaying()) return;

    const measures = this.currentPiece().measures;
    if (mIdx >= measures.length) {
      // Completed piece
      this.stopPlayback();
      this.activeMeasureIndex.set(0);
      this.activeNoteIndex.set(null);
      return;
    }

    const currentMeasure = measures[mIdx];
    if (nIdx >= currentMeasure.notes.length) {
      // Advance to next measure
      this.playStep(mIdx + 1, 0);
      return;
    }

    this.activeMeasureIndex.set(mIdx);
    this.activeNoteIndex.set(nIdx);

    const note = currentMeasure.notes[nIdx];
    const beatDurationSec = 60 / this.bpm();
    const noteDurationSec = note.durationBeats * beatDurationSec;

    this.playSynthNote(note.freq, noteDurationSec);

    this.playbackTimeoutId = window.setTimeout(() => {
      this.playStep(mIdx, nIdx + 1);
    }, noteDurationSec * 1000);
  }

  private playSynthNote(freq: number, duration: number): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
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
}
