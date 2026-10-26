import { describe, expect, it } from 'vitest';
import {
  calculateOrthodoxEaster,
  getGreekStatutoryHolidays,
  isGreekStatutoryHoliday,
} from './greek-calendar.js';

describe('Greek Conservatory Calendar & Holiday Suppression', () => {
  it('correctly calculates Orthodox Easter Sunday for multiple years', () => {
    expect(calculateOrthodoxEaster(2025).toISOString().slice(0, 10)).toBe('2025-04-20');
    expect(calculateOrthodoxEaster(2026).toISOString().slice(0, 10)).toBe('2026-04-12');
    expect(calculateOrthodoxEaster(2027).toISOString().slice(0, 10)).toBe('2027-05-02');
  });

  it('correctly calculates 2026 movable religious feasts', () => {
    const holidays2026 = getGreekStatutoryHolidays(2026);
    const byName = new Map(holidays2026.map((h) => [h.name, h.date]));

    // Kathara Deftera: 48 days before April 12, 2026 = Feb 23, 2026
    expect(byName.get('Καθαρά Δευτέρα')).toBe('2026-02-23');

    // Megali Paraskevi: 2 days before April 12, 2026 = April 10, 2026
    expect(byName.get('Μεγάλη Παρασκευή')).toBe('2026-04-10');

    // Deftera tou Pascha: 1 day after April 12, 2026 = April 13, 2026
    expect(byName.get('Δευτέρα του Πάσχα')).toBe('2026-04-13');

    // Agiou Pnevmatos: 50 days after April 12, 2026 = June 1, 2026
    expect(byName.get('Αγίου Πνεύματος')).toBe('2026-06-01');
  });

  it('includes fixed Greek national and statutory conservatory holidays', () => {
    const holidays2026 = getGreekStatutoryHolidays(2026);
    const dates = new Set(holidays2026.map((h) => h.date));

    expect(dates.has('2026-01-01')).toBe(true); // Πρωτοχρονιά
    expect(dates.has('2026-01-06')).toBe(true); // Θεοφάνεια
    expect(dates.has('2026-03-25')).toBe(true); // 25η Μαρτίου
    expect(dates.has('2026-05-01')).toBe(true); // Πρωτομαγιά
    expect(dates.has('2026-08-15')).toBe(true); // 15 Αυγούστου
    expect(dates.has('2026-10-28')).toBe(true); // 28η Οκτωβρίου
    expect(dates.has('2026-12-25')).toBe(true); // Χριστούγεννα
    expect(dates.has('2026-12-26')).toBe(true); // 2η μέρα Χριστουγέννων
  });

  it('detects statutory holidays and distinguishes regular teaching days', () => {
    // Kathara Deftera 2026
    const res1 = isGreekStatutoryHoliday('2026-02-23');
    expect(res1.isHoliday).toBe(true);
    expect(res1.holiday?.name).toBe('Καθαρά Δευτέρα');

    // 28th October
    const res2 = isGreekStatutoryHoliday('2026-10-28');
    expect(res2.isHoliday).toBe(true);
    expect(res2.holiday?.name).toContain('28η Οκτωβρίου');

    // Normal teaching day
    const res3 = isGreekStatutoryHoliday('2026-10-27');
    expect(res3.isHoliday).toBe(false);
  });
});
