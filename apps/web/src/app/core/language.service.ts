import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export type Lang = 'el' | 'en';
const LANG_KEY = 'musicos.lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  readonly current = signal<Lang>(this.initialLang());

  init(): void {
    this.apply(this.current());
  }

  set(lang: Lang): void {
    this.current.set(lang);
    this.apply(lang);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // ignore storage failures
    }
  }

  toggle(): void {
    this.set(this.current() === 'el' ? 'en' : 'el');
  }

  private apply(lang: Lang): void {
    this.transloco.setActiveLang(lang);
    document.documentElement.lang = lang;
  }

  private initialLang(): Lang {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored === 'el' || stored === 'en') return stored;
    } catch {
      // ignore
    }
    return 'el';
  }
}
