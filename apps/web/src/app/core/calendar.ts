export type CalendarDayKind = 'HOLIDAY' | 'CLOSED' | 'MAKEUP_DAY';

/** A dated exception to the weekly timetable (holiday, closure or make-up day). */
export interface CalendarDay {
  id: string;
  /** ISO `yyyy-MM-dd`. */
  date: string;
  kind: CalendarDayKind;
  name: string;
  branchId: string | null;
  branch?: { id: string; name: string } | null;
}
