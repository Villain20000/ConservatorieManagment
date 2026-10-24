import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { saveBlob } from '../../core/download';
import { FormatService } from '../../core/format.service';
import type { DocumentRecord } from '../../core/models';
import { PortalContextService } from '../../core/portal-context.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';
import { PortalChildSelectorComponent } from './portal-child-selector';

@Component({
  selector: 'app-portal-documents',
  imports: [SHARED_IMPORTS, PortalChildSelectorComponent],
  template: `
    <div class="page">
      <app-page-header
        eyebrow="portal.eyebrow"
        title="portal.documents.title"
        subtitle="portal.documents.subtitle"
      />

      <app-portal-child-selector (changed)="reload()" />

      @if (loading()) {
        <div class="card space-y-3 p-5">
          @for (row of [1, 2, 3, 4]; track row) {
            <div class="flex items-center gap-4">
              <div class="skeleton h-9 w-9 rounded-lg"></div>
              <div class="skeleton h-4 w-48"></div>
              <div class="skeleton h-4 flex-1"></div>
              <div class="skeleton h-5 w-20"></div>
            </div>
          }
        </div>
      } @else if (documents().length === 0) {
        <div class="card">
          <app-empty-state
            title="portal.documents.empty"
            message="portal.documents.emptyHint"
            icon="folder"
          />
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table min-w-[720px]">
            <thead>
              <tr>
                <th>{{ 'documents.columns.title' | transloco }}</th>
                <th>{{ 'documents.columns.type' | transloco }}</th>
                <th>{{ 'documents.columns.reference' | transloco }}</th>
                <th>{{ 'documents.columns.issuedAt' | transloco }}</th>
                <th>{{ 'documents.columns.status' | transloco }}</th>
                <th class="w-12"></th>
              </tr>
            </thead>
            <tbody>
              @for (document of documents(); track document.id) {
                <tr>
                  <td>
                    <div class="flex items-center gap-2.5">
                      <span class="icon-box h-9 w-9 shrink-0">
                        <app-icon name="file-text" [size]="15" />
                      </span>
                      <span class="font-medium text-ink">{{ document.title }}</span>
                    </div>
                  </td>
                  <td>{{ ('documentType.' + document.type) | transloco }}</td>
                  <td class="whitespace-nowrap font-mono text-[12px]">
                    {{ document.protocolNumber || document.referenceNumber || '—' }}
                  </td>
                  <td class="whitespace-nowrap">{{ format.date(document.issuedAt) }}</td>
                  <td><app-status-badge [status]="document.status" /></td>
                  <td>
                    <button
                      type="button"
                      class="btn-ghost btn-icon-sm"
                      [disabled]="downloadingId() === document.id"
                      (click)="download(document)"
                      [attr.aria-label]="'documents.download' | transloco"
                    >
                      <app-icon name="download" [size]="15" />
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalDocumentsPage {
  private readonly api = inject(ApiService);
  protected readonly portal = inject(PortalContextService);

  readonly format = inject(FormatService);

  readonly documents = signal<DocumentRecord[]>([]);
  readonly loading = signal(true);
  readonly downloadingId = signal<string | null>(null);

  constructor() {
    void this.portal.ensureLoaded().then(() => this.load());
  }

  reload(): void {
    void this.load();
  }

  async download(document: DocumentRecord): Promise<void> {
    if (this.downloadingId()) return;
    this.downloadingId.set(document.id);
    try {
      const blob = await firstValueFrom(
        this.api.blob(`/portal/documents/${document.id}/pdf`, this.portal.childParam()),
      );
      saveBlob(blob, document.fileName ?? `document-${document.id}.pdf`);
    } catch {
      // Errors surface through the global interceptor.
    } finally {
      this.downloadingId.set(null);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.documents.set(
        await firstValueFrom(
          this.api.get<DocumentRecord[]>('/portal/documents', this.portal.childParam()),
        ),
      );
    } catch {
      this.documents.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
