import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export const OBJECT_STORAGE = 'OBJECT_STORAGE';

const KEY_PATTERN = /^[a-zA-Z0-9/_.-]+$/;

@Injectable()
export class LocalDiskStorage implements ObjectStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('STORAGE_DIR');
    this.root = resolve(configured ?? join(process.cwd(), 'var', 'storage'));
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.resolveKey(key);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, data);
    await rename(temporary, target);
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolveKey(key));
    } catch {
      throw new NotFoundException('Το αρχείο δεν βρέθηκε');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch {
      // Missing files are already deleted.
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  private resolveKey(key: string): string {
    if (!key || !KEY_PATTERN.test(key) || key.includes('..')) {
      throw new NotFoundException('Μη έγκυρο κλειδί αρχείου');
    }
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(`${this.root}${sep}`)) {
      throw new NotFoundException('Μη έγκυρο κλειδί αρχείου');
    }
    return full;
  }
}
