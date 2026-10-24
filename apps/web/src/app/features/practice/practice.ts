import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { FormatService } from '../../core/format.service';
import {
  OfflineMaterialService,
  type OfflineMaterialMeta,
} from '../../core/offline-material.service';
import { PortalContextService } from '../../core/portal-context.service';
import type { DocumentRecord, PortalOverview } from '../../core/models';
import { SHARED_IMPORTS } from '../../shared/shared.imports';
import { PortalChildSelectorComponent } from '../portal/portal-child-selector';
import { MetronomeComponent } from './metronome';
import { TunerComponent } from './tuner';

interface PracticeDraft {
  text: string;
  status: 'draft' | 'pending';
  updatedAt: string | null;
}

const DRAFT_KEY = 'musicos.practice-draft';

/**
 * Learning workspace: next-lesson overview, client-side metronome/tuner,
 * explicitly pinned offline material, and an AI practice draft that stays a
 * draft until a teacher approves it — drafts are local-only and never
 * published or sent automatically.
 */
@Component({
  selector: 'app-practice',
  imports: [SHARED_IMPORTS, PortalChildSelectorComponent, MetronomeComponent, TunerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-page-header
        eyebrow="practice.eyebrow"
        title="practice.title"
        subtitle="practice.subtitle"
      />

      @if (isPortal()) {
        <app-portal-child-selector (changed)="reload()" />
      }

      @if (isPortal()) {
        <section class="card mb-4 p-5">
          <h2 class="text-sm font-semibold">{{ 'practice.overview.title' | transloco }}</h2>
          @if (overviewLoading()) {
            <div class="skeleton mt-3 h-16 rounded-xl"></div>
          } @else if (overview(); as info) {
            @if (info.nextLesson) {
              <p class="mt-2 text-xl font-semibold">{{ info.nextLesson.title }}</p>
              <p class="mt-1 text-[13px] text-ink-2">
                {{ format.date(info.nextLesson.startsAt, 'long') }} ·
                {{ format.timeRange(info.nextLesson.startsAt, info.nextLesson.endsAt) }}
              </p>
            } @else {
              <p class="mt-2 text-[13.5px] text-ink-2">{{ 'practice.overview.empty' | transloco }}</p>
            }
            <div class="mt-3 flex flex-wrap gap-2 text-[12px]">
              <span class="rounded-full border border-line bg-surface-2 px-2.5 py-1">
                {{ 'practice.overview.attendance' | transloco }}:
                <strong class="tabular-nums">{{ format.percent(info.attendance.rate) }}</strong>
              </span>
              <span class="rounded-full border border-line bg-surface-2 px-2.5 py-1">
                {{ 'practice.overview.outstanding' | transloco }}:
                <strong class="tabular-nums">{{ format.money(info.finance.outstanding) }}</strong>
              </span>
              <a class="rounded-full border border-line px-2.5 py-1 font-medium text-accent-strong hover:underline" routerLink="/app/portal/schedule">
                {{ 'practice.overview.openSchedule' | transloco }}
              </a>
            </div>
          }
        </section>
      }

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <app-metronome />
        <app-tuner />
      </div>

      @if (isPortal()) {
        <section class="card mt-4 p-5">
          <h2 class="text-sm font-semibold">{{ 'practice.material.title' | transloco }}</h2>
          <p class="mt-0.5 text-[12px] text-ink-3">{{ 'practice.material.subtitle' | transloco }}</p>

          @if (pins().length > 0) {
            <p class="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
              {{ 'practice.material.pinned' | transloco }} ({{ pins().length }})
            </p>
            <div class="space-y-2">
              @for (pin of pins(); track pin.id) {
                <div class="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
                  <app-icon name="folder" [size]="15" class="shrink-0 text-accent" />
                  <p class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ pin.title }}</p>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="openPinned(pin)">
                    {{ 'practice.material.open' | transloco }}
                  </button>
                  <button type="button" class="btn-ghost btn-icon-sm" (click)="unpin(pin.id)" [attr.aria-label]="'practice.material.unpin' | transloco">
                    <app-icon name="x" [size]="14" />
                  </button>
                </div>
              }
            </div>
          } @else {
            <p class="mt-4 text-[12.5px] text-ink-3">{{ 'practice.material.empty' | transloco }}</p>
          }

          <p class="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
            {{ 'practice.material.available' | transloco }}
          </p>
          <div class="space-y-2">
            @for (document of documents(); track document.id) {
              <div class="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
                <app-icon name="file-text" [size]="15" class="shrink-0" />
                <p class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ document.title }}</p>
                @if (offline.isPinned(document.id)) {
                  <span class="text-[11px] font-medium text-[#2f7d5d]">
                    {{ 'practice.material.offline' | transloco }}
                  </span>
                } @else {
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    [disabled]="pinningId() === document.id"
                    (click)="pin(document)"
                  >
                    {{ 'practice.material.pin' | transloco }}
                  </button>
                }
              </div>
            } @empty {
              <app-empty-state title="portal.documents.empty" icon="folder" />
            }
          </div>
          <p class="mt-3 text-[11.5px] text-ink-3">{{ 'practice.material.note' | transloco }}</p>
        </section>

        <section class="card mt-4 p-5">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold">{{ 'practice.draft.title' | transloco }}</h2>
            <span class="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
              {{ (draft().status === 'pending' ? 'practice.draft.statusPending' : 'practice.draft.statusDraft') | transloco }}
            </span>
          </div>
          <p class="mt-0.5 text-[12px] text-ink-3">{{ 'practice.draft.subtitle' | transloco }}</p>
          <textarea
            class="mt-3 min-h-[96px] w-full rounded-xl border border-line bg-surface-2 p-3 text-[13.5px] leading-relaxed outline-none focus:border-accent"
            [placeholder]="'practice.draft.placeholder' | transloco"
            [value]="draft().text"
            (input)="draft.update((d) => ({ ...d, text: $any($event.target).value }))"
          ></textarea>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="btn btn-secondary btn-sm" (click)="saveDraft()">
              {{ 'practice.draft.save' | transloco }}
            </button>
            @if (draft().text.trim()) {
              <button type="button" class="btn btn-secondary btn-sm" (click)="requestApproval()">
                {{ 'practice.draft.requestApproval' | transloco }}
              </button>
              <button type="button" class="btn-ghost btn-icon-sm" (click)="clearDraft()" [attr.aria-label]="'practice.draft.clear' | transloco">
                <app-icon name="trash" [size]="14" />
              </button>
            }
          </div>
          @if (draftSaved()) {
            <p class="mt-2 text-[12px] font-medium text-[#2f7d5d]">{{ 'practice.draft.saved' | transloco }}</p>
          }
          @if (draft().status === 'pending') {
            <p class="mt-2 text-[12px] font-medium text-ink-2">{{ 'practice.draft.pending' | transloco }}</p>
          }
          <p class="mt-1 text-[11.5px] text-ink-3">{{ 'practice.draft.hint' | transloco }}</p>
        </section>
      }
    </div>
  `,
})
export class PracticePage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  protected readonly format = inject(FormatService);
  protected readonly portal = inject(PortalContextService);
  protected readonly offline = inject(OfflineMaterialService);

  readonly overview = signal<PortalOverview | null>(null);
  readonly overviewLoading = signal(false);
  readonly documents = signal<DocumentRecord[]>([]);
  readonly pinningId = signal<string | null>(null);
  readonly draft = signal<PracticeDraft>(this.readDraft());
  readonly draftSaved = signal(false);

  readonly pins = this.offline.pins;
  readonly isPortal = computed(() => {
    const role = this.auth.role();
    return role === 'STUDENT' || role === 'GUARDIAN';
  });

  constructor() {
    void this.offline.init();
    if (this.isPortal()) {
      void this.portal.ensureLoaded().then(() => this.reload());
    }
  }

  reload(): void {
    this.draftSaved.set(false);
    void this.loadOverview();
    void this.loadDocuments();
  }

  async pin(document: DocumentRecord): Promise<void> {
    if (this.pinningId()) return;
    this.pinningId.set(document.id);
    try {
      const blob = await firstValueFrom(
        this.api.blob(`/portal/documents/${document.id}/pdf`, this.portal.childParam()),
      );
      await this.offline.pin(document.id, document.title, blob);
    } catch {
      await this.offline.pin(document.id, document.title, null);
    } finally {
      this.pinningId.set(null);
    }
  }

  async unpin(id: string): Promise<void> {
    await this.offline.unpin(id);
  }

  async openPinned(pin: OfflineMaterialMeta): Promise<void> {
    const blob = await this.offline.openBlob(pin.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  saveDraft(): void {
    this.writeDraft({ ...this.draft(), status: 'draft', updatedAt: new Date().toISOString() });
    this.draftSaved.set(true);
  }

  /**
   * Approval request stays local: the draft is only flagged for review and
   * shown to the learner. AI output is never published, sent, or applied
   * without an explicit teacher approval made outside this page.
   */
  requestApproval(): void {
    this.writeDraft({ ...this.draft(), status: 'pending', updatedAt: new Date().toISOString() });
    this.draftSaved.set(false);
  }

  clearDraft(): void {
    this.writeDraft({ text: '', status: 'draft', updatedAt: null });
    this.draftSaved.set(false);
  }

  private async loadOverview(): Promise<void> {
    this.overviewLoading.set(true);
    try {
      this.overview.set(
        await firstValueFrom(
          this.api.get<PortalOverview>('/portal/overview', this.portal.childParam()),
        ),
      );
    } catch {
      this.overview.set(null);
    } finally {
      this.overviewLoading.set(false);
    }
  }

  private async loadDocuments(): Promise<void> {
    try {
      this.documents.set(
        await firstValueFrom(
          this.api.get<DocumentRecord[]>('/portal/documents', this.portal.childParam()),
        ),
      );
    } catch {
      this.documents.set([]);
    }
  }

  private readDraft(): PracticeDraft {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PracticeDraft>;
        if (typeof parsed.text === 'string') {
          return {
            text: parsed.text,
            status: parsed.status === 'pending' ? 'pending' : 'draft',
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
          };
        }
      }
    } catch {
      // Corrupt draft: start clean.
    }
    return { text: '', status: 'draft', updatedAt: null };
  }

  private writeDraft(next: PracticeDraft): void {
    this.draft.set(next);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // Private-mode quota: the in-memory draft still works this session.
    }
  }
}
