import { Injectable, signal } from '@angular/core';

export interface OfflineMaterialMeta {
  id: string;
  title: string;
  pinnedAt: string;
  size: number | null;
}

const META_KEY = 'musicos.offline-material';
const DB_NAME = 'musicos-offline';
const STORE = 'material';

/**
 * Offline locker for explicitly pinned study material only. Nothing is
 * cached automatically: metadata lives in localStorage, PDF bytes in
 * IndexedDB, and only items the learner pins are stored. No service-worker
 * precache — the rest of the app stays online-only by design.
 */
@Injectable({ providedIn: 'root' })
export class OfflineMaterialService {
  readonly pins = signal<OfflineMaterialMeta[]>(this.readMeta());
  readonly ready = signal(false);

  async init(): Promise<void> {
    try {
      await this.db();
      this.ready.set(true);
    } catch {
      this.ready.set(false);
    }
  }

  isPinned(id: string): boolean {
    return this.pins().some((pin) => pin.id === id);
  }

  async pin(id: string, title: string, blob: Blob | null): Promise<boolean> {
    try {
      if (blob) {
        const store = await this.store('readwrite');
        await this.request(store.put(blob, id));
      }
      const next = [
        ...this.pins().filter((pin) => pin.id !== id),
        { id, title, pinnedAt: new Date().toISOString(), size: blob?.size ?? null },
      ];
      this.writeMeta(next);
      return true;
    } catch {
      return false;
    }
  }

  async unpin(id: string): Promise<void> {
    try {
      const store = await this.store('readwrite');
      await this.request(store.delete(id));
    } catch {
      // Metadata is the source of truth for the list; storage failure only
      // orphans bytes that are keyed by id and overwritten on re-pin.
    }
    this.writeMeta(this.pins().filter((pin) => pin.id !== id));
  }

  async openBlob(id: string): Promise<Blob | null> {
    try {
      const store = await this.store('readonly');
      const blob = (await this.request(store.get(id))) as Blob | undefined;
      return blob ?? null;
    } catch {
      return null;
    }
  }

  private readMeta(): OfflineMaterialMeta[] {
    try {
      const raw = localStorage.getItem(META_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as OfflineMaterialMeta[]) : [];
    } catch {
      return [];
    }
  }

  private writeMeta(next: OfflineMaterialMeta[]): void {
    this.pins.set(next);
    try {
      localStorage.setItem(META_KEY, JSON.stringify(next));
    } catch {
      // Private-mode quota: keep the in-memory list for this session.
    }
  }

  private db(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore(STORE);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const database = await this.db();
    return database.transaction(STORE, mode).objectStore(STORE);
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
