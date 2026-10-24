import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const ATHENS_TZ = 'Europe/Athens';

export function athensDateKey(value: Date | string = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return formatInTimeZone(date, ATHENS_TZ, 'yyyy-MM-dd');
}

export function athensTimeKey(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return formatInTimeZone(date, ATHENS_TZ, 'HH:mm');
}

export function addDaysKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function startOfWeekKey(key: string = athensDateKey()): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function weekDayKeys(startKey: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDaysKey(startKey, index));
}

export function weekdayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return ((date.getUTCDay() + 6) % 7) + 1;
}

export function keyFromDateParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function athensDateTime(dateKey: string, time: string): Date {
  return fromZonedTime(`${dateKey}T${time}:00`, ATHENS_TZ);
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function athensMinutes(value: Date | string): number {
  const time = athensTimeKey(value);
  return timeToMinutes(time);
}

export function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

export function monthKey(value: Date | string = new Date()): string {
  return athensDateKey(value).slice(0, 7);
}

export function keyToInputDate(key: string): string {
  return key;
}

export function todayKey(): string {
  return athensDateKey();
}
