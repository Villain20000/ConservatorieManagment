import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import type { DataResponse, PortalChild } from './models';

/**
 * Shared portal context for student/guardian views. Guardians pick one of
 * their linked children (via `guardianChildIds` on the API); the selected id
 * is forwarded as `studentId` so every portal query stays scoped to a child
 * the guardian may access. Single-child and student sessions resolve without
 * ever requiring an explicit choice.
 */
@Injectable({ providedIn: 'root' })
export class PortalContextService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly children = signal<PortalChild[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loaded = signal(false);

  readonly needsSelection = computed(
    () => this.auth.role() === 'GUARDIAN' && this.children().length > 1,
  );

  readonly selectedChild = computed(
    () =>
      this.children().find((child) => child.id === this.selectedId()) ??
      this.children()[0] ??
      null,
  );

  /** Query fragment scoping a portal request to the selected child. */
  readonly childParam = computed((): Record<string, string> => {
    const selected = this.selectedId();
    if (this.auth.role() === 'GUARDIAN' && selected) return { studentId: selected };
    return {};
  });

  async ensureLoaded(): Promise<void> {
    if (this.loaded() || this.loading()) return;
    const role = this.auth.role();
    if (role !== 'STUDENT' && role !== 'GUARDIAN') {
      this.loaded.set(true);
      return;
    }
    this.loading.set(true);
    try {
      const response = await firstValueFrom(
        this.api.list<PortalChild>('/portal/children'),
      );
      const list: PortalChild[] = (response as DataResponse<PortalChild>).data ?? [];
      this.children.set(list);
      if (!this.selectedId() && list.length > 0) {
        this.selectedId.set(list[0].id);
      }
    } catch {
      this.children.set([]);
    } finally {
      this.loading.set(false);
      this.loaded.set(true);
    }
  }

  select(id: string): void {
    if (this.children().some((child) => child.id === id)) {
      this.selectedId.set(id);
    }
  }
}
