import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import type { PageMeta } from './models';

export type TrashEntity = 'students' | 'teachers' | 'documents' | 'lessonSeries' | 'announcements';

export interface TrashRow {
  id: string;
  label: string;
  deletedAt: string;
  deletedBy: string | null;
}

export interface TrashPage {
  data: TrashRow[];
  meta: PageMeta;
}

/** `lessonSeries` is the only entity whose restore path differs from its trash path. */
const RESTORE_PATHS: Record<TrashEntity, string> = {
  students: '/students',
  teachers: '/teachers',
  documents: '/documents',
  lessonSeries: '/lesson-series',
  announcements: '/announcements',
};

@Injectable({ providedIn: 'root' })
export class TrashService {
  private readonly api = inject(ApiService);

  async list(entity: TrashEntity, page: number, pageSize: number): Promise<TrashPage> {
    const response = await firstValueFrom(
      this.api.list<TrashRow>(`/trash/${entity}`, { page, pageSize }),
    );
    const data = response.data ?? [];
    return {
      data,
      meta: response.meta ?? {
        page,
        pageSize,
        total: data.length,
        totalPages: 1,
      },
    };
  }

  async restore(entity: TrashEntity, id: string): Promise<void> {
    await firstValueFrom(
      this.api.post<{ success: boolean }>(
        `${RESTORE_PATHS[entity]}/${encodeURIComponent(id)}/restore`,
      ),
    );
  }
}
