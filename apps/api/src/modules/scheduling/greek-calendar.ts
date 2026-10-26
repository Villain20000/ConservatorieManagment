/**
 * Greek Conservatory Statutory & Religious Calendar.
 *
 * Implements astronomical calculation of Orthodox Easter (Paschalion) and
 * derives both fixed Greek national holidays and movable religious closures
 * (Clean Monday, Easter week, Whit Monday).
 */

export interface GreekHoliday {
  date: string; // ISO date 'YYYY-MM-DD'
  name: string; // Greek statutory title
  kind: 'HOLIDAY' | 'CLOSED';
}

/**
 * Calculates Orthodox Easter Sunday for any Gregorian year using the
 * Meeus Julian algorithm with Gregorian offset (+13 days for 1900–2099).
 */
export function calculateOrthodoxEaster(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;

  // Julian calendar Easter
  const easterJulian = new Date(Date.UTC(year, month - 1, day));
  // Offset to Gregorian calendar (+13 days in 20th and 21st century)
  easterJulian.setUTCDate(easterJulian.getUTCDate() + 13);
  return easterJulian;
}

function offsetDays(baseDate: Date, days: number): string {
  const d = new Date(baseDate.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns all official Greek national holidays and conservatory closures for a given calendar year.
 */
export function getGreekStatutoryHolidays(year: number): GreekHoliday[] {
  const easter = calculateOrthodoxEaster(year);

  const holidays: GreekHoliday[] = [
    // Fixed public and statutory holidays
    { date: `${year}-01-01`, name: 'Πρωτοχρονιά', kind: 'HOLIDAY' },
    { date: `${year}-01-06`, name: 'Θεοφάνεια', kind: 'HOLIDAY' },
    { date: `${year}-01-30`, name: 'Τριών Ιεραρχών', kind: 'CLOSED' },
    {
      date: `${year}-03-25`,
      name: '25η Μαρτίου (Ευαγγελισμός / Εθνική Επέτειος)',
      kind: 'HOLIDAY',
    },
    { date: `${year}-05-01`, name: 'Εργατική Πρωτομαγιά', kind: 'HOLIDAY' },
    { date: `${year}-08-15`, name: 'Κοίμηση της Θεοτόκου', kind: 'HOLIDAY' },
    { date: `${year}-10-28`, name: '28η Οκτωβρίου (Επέτειος του Όχι)', kind: 'HOLIDAY' },
    { date: `${year}-11-17`, name: 'Επέτειος Πολυτεχνείου', kind: 'CLOSED' },
    { date: `${year}-12-25`, name: 'Χριστούγεννα', kind: 'HOLIDAY' },
    { date: `${year}-12-26`, name: 'Σύναξη της Θεοτόκου', kind: 'HOLIDAY' },

    // Orthodox Easter movable feasts
    { date: offsetDays(easter, -48), name: 'Καθαρά Δευτέρα', kind: 'HOLIDAY' },
    { date: offsetDays(easter, -2), name: 'Μεγάλη Παρασκευή', kind: 'HOLIDAY' },
    { date: offsetDays(easter, -1), name: 'Μεγάλο Σάββατο', kind: 'CLOSED' },
    { date: offsetDays(easter, 0), name: 'Κυριακή του Πάσχα', kind: 'HOLIDAY' },
    { date: offsetDays(easter, 1), name: 'Δευτέρα του Πάσχα', kind: 'HOLIDAY' },
    { date: offsetDays(easter, 50), name: 'Αγίου Πνεύματος', kind: 'HOLIDAY' },
  ];

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Checks whether an ISO date string falls on a statutory Greek holiday or closure.
 */
export function isGreekStatutoryHoliday(dateIso: string): { isHoliday: boolean; holiday?: GreekHoliday } {
  const year = Number.parseInt(dateIso.slice(0, 4), 10);
  if (Number.isNaN(year)) return { isHoliday: false };

  const holidays = getGreekStatutoryHolidays(year);
  const match = holidays.find((h) => h.date === dateIso);
  return match ? { isHoliday: true, holiday: match } : { isHoliday: false };
}
