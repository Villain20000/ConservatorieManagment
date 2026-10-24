import { Injectable, inject } from '@angular/core';
import { formatInTimeZone } from 'date-fns-tz';
import { LanguageService } from './language.service';

export const ATHENS_TZ = 'Europe/Athens';

type DateStyle = 'short' | 'medium' | 'long' | 'dayMonth' | 'monthYear' | 'weekday';

@Injectable({ providedIn: 'root' })
export class FormatService {
  private readonly language = inject(LanguageService);

  private locale(): string {
    return this.language.current() === 'el' ? 'el-GR' : 'en-GB';
  }

  money(value: string | number | null | undefined, compact = false): string {
    const amount = Number(value ?? 0);
    return new Intl.NumberFormat(this.locale(), {
      style: 'currency',
      currency: 'EUR',
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  number(value: number | null | undefined, digits = 0): string {
    return new Intl.NumberFormat(this.locale(), {
      maximumFractionDigits: digits,
    }).format(Number(value ?? 0));
  }

  percent(value: number | null | undefined, digits = 0): string {
    if (value === null || value === undefined) return '—';
    return `${this.number(value, digits)}%`;
  }

  date(value: string | Date | null | undefined, style: DateStyle = 'medium'): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const options: Intl.DateTimeFormatOptions = { timeZone: ATHENS_TZ };
    switch (style) {
      case 'short':
        options.day = '2-digit';
        options.month = '2-digit';
        options.year = 'numeric';
        break;
      case 'long':
        options.day = 'numeric';
        options.month = 'long';
        options.year = 'numeric';
        options.weekday = 'long';
        break;
      case 'dayMonth':
        options.day = 'numeric';
        options.month = 'short';
        break;
      case 'monthYear':
        options.month = 'long';
        options.year = 'numeric';
        break;
      case 'weekday':
        options.weekday = 'short';
        options.day = 'numeric';
        options.month = 'short';
        break;
      default:
        options.day = 'numeric';
        options.month = 'short';
        options.year = 'numeric';
    }
    return new Intl.DateTimeFormat(this.locale(), options).format(date);
  }

  time(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return formatInTimeZone(date, ATHENS_TZ, 'HH:mm');
  }

  timeRange(start: string | Date, end: string | Date): string {
    return `${this.time(start)}–${this.time(end)}`;
  }

  dateTime(value: string | Date | null | undefined): string {
    if (!value) return '—';
    return `${this.date(value, 'medium')} · ${this.time(value)}`;
  }

  timeAgo(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    const diff = Date.now() - date.getTime();
    const minutes = Math.round(diff / 60_000);
    const hours = Math.round(diff / 3_600_000);
    const days = Math.round(diff / 86_400_000);
    if (this.language.current() === 'el') {
      if (minutes < 1) return 'μόλις τώρα';
      if (minutes < 60) return `πριν ${minutes}′`;
      if (hours < 24) return `πριν ${hours} ώ`;
      if (days < 30) return `πριν ${days} ημ`;
      return this.date(date);
    }
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return this.date(date);
  }

  monthLabel(month: string): string {
    const [year, value] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, value - 1, 1));
    return new Intl.DateTimeFormat(this.locale(), {
      month: 'short',
      timeZone: 'UTC',
    }).format(date);
  }

  weekdayNames(style: 'short' | 'long' = 'short'): string[] {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.UTC(2024, 0, 1 + index));
      return new Intl.DateTimeFormat(this.locale(), {
        weekday: style,
        timeZone: 'UTC',
      }).format(date);
    });
  }

  initials(firstName?: string | null, lastName?: string | null): string {
    return `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase() || '?';
  }
}
