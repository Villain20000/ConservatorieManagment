/**
 * Pure calendar rules for lesson materialisation.
 *
 * Kept free of Nest and Prisma so the recurrence/DST logic can be unit tested
 * without a database. All dates are ISO `yyyy-MM-dd` strings interpreted as
 * wall-clock dates in the institution's time zone (Europe/Athens today).
 */
import { fromZonedTime } from 'date-fns-tz';

export type CalendarDayKind = 'HOLIDAY' | 'CLOSED' | 'MAKEUP_DAY';

export interface CalendarDayRule {
  /** ISO date, `yyyy-MM-dd`. */
  date: string;
  kind: CalendarDayKind;
  /** null for a tenant-wide rule, otherwise limited to one branch. */
  branchId: string | null;
}

export interface Occurrence {
  startsAt: Date;
  endsAt: Date;
  /** ISO date of the lesson in the institution time zone. */
  date: string;
}

/**
 * A day blocks the regular timetable when it is a holiday or an explicit
 * closure. Both tenant-wide and branch-scoped rules apply to that branch.
 */
export function isBlockingDay(
  date: string,
  branchId: string,
  rules: ReadonlyMap<string, CalendarDayRule[]>,
): boolean {
  const dayRules = rules.get(date);
  if (!dayRules || dayRules.length === 0) return false;
  return dayRules.some(
    (rule) => rule.kind !== 'MAKEUP_DAY' && (rule.branchId === null || rule.branchId === branchId),
  );
}

export function groupRules(rules: CalendarDayRule[]): Map<string, CalendarDayRule[]> {
  const map = new Map<string, CalendarDayRule[]>();
  for (const rule of rules) {
    const list = map.get(rule.date) ?? [];
    list.push(rule);
    map.set(rule.date, list);
  }
  return map;
}

/** ISO weekday: Monday = 1 … Sunday = 7, independent of the time zone. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return ((day + 6) % 7) + 1;
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export interface RecurrenceInput {
  validFrom: string;
  validTo: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
}

/**
 * Builds the weekly occurrences for a series.
 *
 * The wall-clock start time is converted to an instant with `fromZonedTime`
 * for each individual date, so a 15:00 lesson stays at 15:00 local time across
 * a DST boundary while the underlying UTC instants shift by an hour.
 */
export function buildOccurrences(
  config: RecurrenceInput,
  options: {
    from?: string;
    timeZone: string;
    holidays?: ReadonlyMap<string, CalendarDayRule[]>;
    branchId?: string;
    maxOccurrences?: number;
  },
): Occurrence[] {
  const start = options.from && options.from > config.validFrom ? options.from : config.validFrom;
  const occurrences: Occurrence[] = [];
  const max = options.maxOccurrences ?? 500;
  let cursor = start;
  while (cursor <= config.validTo) {
    if (isoWeekday(cursor) === config.weekday) {
      const blocked =
        options.holidays !== undefined &&
        options.branchId !== undefined &&
        isBlockingDay(cursor, options.branchId, options.holidays);
      if (!blocked) {
        const startsAt = fromZonedTime(`${cursor}T${config.startTime}:00`, options.timeZone);
        occurrences.push({
          startsAt,
          endsAt: new Date(startsAt.getTime() + config.durationMinutes * 60_000),
          date: cursor,
        });
        if (occurrences.length > max) {
          throw new RangeError('TOO_MANY_OCCURRENCES');
        }
      }
    }
    cursor = addDays(cursor, 1);
  }
  return occurrences;
}

/** Dates on which a make-up lesson may be scheduled (explicit MAKEUP_DAY rules). */
export function makeupDays(
  rules: CalendarDayRule[],
  branchId: string,
): string[] {
  return rules
    .filter((rule) => rule.kind === 'MAKEUP_DAY' && (rule.branchId === null || rule.branchId === branchId))
    .map((rule) => rule.date)
    .sort();
}
