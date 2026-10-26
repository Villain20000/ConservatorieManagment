import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FormatService } from '../../core/format.service';
import type { DocumentRecord } from '../../core/models';
import { IconComponent } from '../../shared/ui/icon';

export interface SignatureRequestRecord {
  id: string;
  documentId: string;
  provider: 'EIDAS' | 'GOV_GR' | 'DOCUSIGN';
  status: 'PENDING_SIGNATURE' | 'SIGNED' | 'REJECTED' | 'EXPIRED';
  signatoryName: string;
  signatoryEmail: string;
  signatoryRole: string;
  token: string;
  signedAt?: string | null;
  signatureSeal?: string | null;
  createdAt: string;
}

@Component({
  selector: 'app-digital-signature-modal',
  imports: [CommonModule, FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div class="w-full max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-2xl flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="flex items-center justify-between pb-3 border-b border-border">
          <div class="flex items-center gap-2.5">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <app-icon name="shield" [size]="18" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-ink">Ηλεκτρονική Υπογραφή (e-Signature)</h3>
              <p class="text-[11.5px] text-ink-3">Πιστοποιημένη ψηφιακή υπογραφή eIDAS & Gov.gr</p>
            </div>
          </div>
          <button type="button" class="btn-ghost btn-icon-sm" (click)="close.emit()">
            <app-icon name="x" [size]="16" />
          </button>
        </div>

        <!-- Document Info Badge -->
        <div class="mt-4 rounded-xl bg-surface-2 p-3 border border-border flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-ink">{{ doc().title }}</p>
            <p class="text-[11px] text-ink-3">
              Πρωτόκολλο: {{ doc().protocolNumber || doc().referenceNumber || '—' }}
            </p>
          </div>
          <span class="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-2">
            {{ doc().status }}
          </span>
        </div>

        <!-- Body Content -->
        <div class="flex-1 overflow-y-auto py-4 space-y-4">
          @if (loading()) {
            <div class="flex flex-col items-center justify-center py-8 text-ink-3">
              <app-icon name="loader" [size]="20" class="animate-spin text-accent mb-2" />
              <p class="text-xs">Ανάκτηση στοιχείων υπογραφής...</p>
            </div>
          } @else if (existingRequest(); as req) {
            <!-- Existing Signature Request Status -->
            <div class="rounded-xl border border-border bg-surface-2 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-ink-2">Κατάσταση Υπογραφής:</span>
                <span
                  class="rounded-full px-2.5 py-0.5 text-xs font-bold"
                  [class.bg-amber-100]="req.status === 'PENDING_SIGNATURE'"
                  [class.text-amber-800]="req.status === 'PENDING_SIGNATURE'"
                  [class.bg-emerald-100]="req.status === 'SIGNED'"
                  [class.text-emerald-800]="req.status === 'SIGNED'"
                >
                  {{ req.status === 'SIGNED' ? '✓ Υπογεγραμμένο' : 'Εκκρεμεί Υπογραφή' }}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span class="text-ink-3">Υπογράφων:</span>
                  <p class="font-medium text-ink">{{ req.signatoryName }} ({{ req.signatoryRole }})</p>
                </div>
                <div>
                  <span class="text-ink-3">Email:</span>
                  <p class="font-medium text-ink">{{ req.signatoryEmail }}</p>
                </div>
                <div>
                  <span class="text-ink-3">Πάροχος:</span>
                  <p class="font-bold text-accent">{{ req.provider }}</p>
                </div>
                <div>
                  <span class="text-ink-3">Ημερομηνία:</span>
                  <p class="font-medium text-ink">{{ format.date(req.createdAt, 'medium') }}</p>
                </div>
              </div>

              @if (req.status === 'SIGNED') {
                <div class="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                  <div class="flex items-center gap-1.5 font-bold">
                    <app-icon name="badge-check" [size]="15" />
                    <span>Έγκυρη Ψηφιακή Σφραγίδα (PAdES-B-LT)</span>
                  </div>
                  <p class="font-mono text-[10.5px] truncate">
                    SHA-256: {{ req.signatureSeal }}
                  </p>
                  <p class="text-[10px] text-emerald-600 dark:text-emerald-400">
                    Υπογράφηκε: {{ format.date(req.signedAt || req.createdAt, 'long') }}
                  </p>
                </div>
              } @else {
                <!-- Action to Sign / Seal (Simulate Signatory Action) -->
                <div class="pt-2 border-t border-border flex items-center justify-between">
                  <span class="text-xs text-ink-3">Προσομοίωση υπογραφής από τον παραλήπτη:</span>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm flex items-center gap-1.5"
                    [disabled]="isBusy()"
                    (click)="signDocument(req.token)"
                  >
                    <app-icon name="pen-tool" [size]="14" />
                    <span>Υπογραφή & Σφράγιση</span>
                  </button>
                </div>
              }
            </div>
          } @else {
            <!-- Form to Request Digital Signature -->
            <form (ngSubmit)="sendSignatureRequest()" class="space-y-3.5">
              <div>
                <label class="block text-xs font-semibold text-ink-2 mb-1">Πάροχος Ηλεκτρονικής Υπογραφής *</label>
                <div class="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    class="rounded-xl border p-2.5 text-center text-xs font-semibold transition-all"
                    [class.border-accent]="formProvider === 'GOV_GR'"
                    [class.bg-accent/10]="formProvider === 'GOV_GR'"
                    [class.border-border]="formProvider !== 'GOV_GR'"
                    (click)="formProvider = 'GOV_GR'"
                  >
                    Gov.gr Wallet
                  </button>

                  <button
                    type="button"
                    class="rounded-xl border p-2.5 text-center text-xs font-semibold transition-all"
                    [class.border-accent]="formProvider === 'EIDAS'"
                    [class.bg-accent/10]="formProvider === 'EIDAS'"
                    [class.border-border]="formProvider !== 'EIDAS'"
                    (click)="formProvider = 'EIDAS'"
                  >
                    eIDAS (EU)
                  </button>

                  <button
                    type="button"
                    class="rounded-xl border p-2.5 text-center text-xs font-semibold transition-all"
                    [class.border-accent]="formProvider === 'DOCUSIGN'"
                    [class.bg-accent/10]="formProvider === 'DOCUSIGN'"
                    [class.border-border]="formProvider !== 'DOCUSIGN'"
                    (click)="formProvider = 'DOCUSIGN'"
                  >
                    DocuSign
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-ink-2 mb-1">Ονοματεπώνυμο Υπογράφοντος *</label>
                <input
                  type="text"
                  [(ngModel)]="formSignatoryName"
                  name="signatoryName"
                  required
                  placeholder="π.χ. Ιωάννης Παπαδόπουλος"
                  class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-ink-2 mb-1">Email Παραλήπτη για Υπογραφή *</label>
                <input
                  type="email"
                  [(ngModel)]="formSignatoryEmail"
                  name="signatoryEmail"
                  required
                  placeholder="papadopoulos@example.gr"
                  class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-ink-2 mb-1">Ιδιότητα Υπογράφοντος *</label>
                <select
                  [(ngModel)]="formSignatoryRole"
                  name="signatoryRole"
                  class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                >
                  <option value="DIRECTOR">Καλλιτεχνικός Διευθυντής</option>
                  <option value="STUDENT">Σπουδαστής / Απόφοιτος</option>
                  <option value="GUARDIAN">Κηδεμόνας</option>
                  <option value="TEACHER">Καθηγητής / Εξεταστής</option>
                </select>
              </div>

              <div class="pt-3 border-t border-border flex items-center justify-end gap-2">
                <button type="button" class="btn btn-secondary btn-sm" (click)="close.emit()">
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  class="btn btn-primary btn-sm flex items-center gap-1.5"
                  [disabled]="isBusy() || !formSignatoryName || !formSignatoryEmail"
                >
                  <app-icon name="send" [size]="14" />
                  <span>{{ isBusy() ? 'Αποστολή...' : 'Αποστολή Αιτήματος Υπογραφής' }}</span>
                </button>
              </div>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class DigitalSignatureModalComponent implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly format = inject(FormatService);

  readonly doc = input.required<DocumentRecord>();
  readonly close = output<void>();

  readonly loading = signal<boolean>(false);
  readonly isBusy = signal<boolean>(false);
  readonly existingRequest = signal<SignatureRequestRecord | null>(null);

  formProvider: 'GOV_GR' | 'EIDAS' | 'DOCUSIGN' = 'GOV_GR';
  formSignatoryName = '';
  formSignatoryEmail = '';
  formSignatoryRole = 'DIRECTOR';

  ngOnInit(): void {
    const d = this.doc();
    if (d.student) {
      this.formSignatoryName = `${d.student.firstName} ${d.student.lastName}`;
    }
    void this.loadExisting();
  }

  async loadExisting(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(
        this.api.get<SignatureRequestRecord[]>(
          `/documents/signatures/document/${this.doc().id}`
        )
      );
      if (res && res.length > 0) {
        this.existingRequest.set(res[0]);
      }
    } catch {
      // none exists yet
    } finally {
      this.loading.set(false);
    }
  }

  async sendSignatureRequest(): Promise<void> {
    this.isBusy.set(true);
    try {
      const created = await firstValueFrom(
        this.api.post<SignatureRequestRecord>('/documents/signatures/request', {
          documentId: this.doc().id,
          provider: this.formProvider,
          signatoryName: this.formSignatoryName,
          signatoryEmail: this.formSignatoryEmail,
          signatoryRole: this.formSignatoryRole,
        })
      );
      this.existingRequest.set(created);
    } catch {
      // Error handled
    } finally {
      this.isBusy.set(false);
    }
  }

  async signDocument(token: string): Promise<void> {
    this.isBusy.set(true);
    try {
      const updated = await firstValueFrom(
        this.api.post<SignatureRequestRecord>(`/documents/signatures/sign/${token}`, {})
      );
      this.existingRequest.set(updated);
    } catch {
      // Error
    } finally {
      this.isBusy.set(false);
    }
  }
}
