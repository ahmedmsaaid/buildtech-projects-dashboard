/**
 * Day and time helpers. A day is 'YYYY-MM-DD' text and a time is minutes
 * after midnight, both in the clinic's timezone (see schema.sql).
 */

export const weekdayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** The current day and minute on the clinic's own clock. */
export function nowIn(timezone: string): { day: string; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { day: `${part('year')}-${part('month')}-${part('day')}`, minute: Number(part('hour')) * 60 + Number(part('minute')) };
}

export function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** 0 is Sunday, 6 is Saturday. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** "السبت 28 نوفمبر" */
export function formatDay(day: string): string {
  const [, month, date] = day.split('-').map(Number);
  return `${weekdayNames[weekdayOf(day)]} ${date} ${monthNames[month - 1]}`;
}

/** 1050 -> "5:30 م" */
export function formatMinute(minute: number): string {
  const hour = Math.floor(minute / 60);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute % 60).padStart(2, '0')} ${hour < 12 ? 'ص' : 'م'}`;
}

/** 1050 -> "17:30", the value of an <input type="time">. */
export function toTimeInput(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** "17:30" -> 1050, or null when the text is not a time. */
export function fromTimeInput(value: unknown): number | null {
  const match = typeof value === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute >= 0 && minute <= 1440 ? minute : null;
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "28 نوفمبر", without the weekday. */
export function formatShortDay(day: string): string {
  const [, month, date] = day.split('-').map(Number);
  return `${date} ${monthNames[month - 1]}`;
}

/** The part of the day a time falls in, used to group slots. */
export function periodOf(minute: number): 'morning' | 'afternoon' | 'evening' {
  return minute < 720 ? 'morning' : minute < 1020 ? 'afternoon' : 'evening';
}

export const periodNames = { morning: 'الصبح', afternoon: 'بعد الضهر', evening: 'بالليل' } as const;

/** The same date a number of months later; the 31st falls back to the month's last day. */
export function addMonths(day: string, count: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + count, 1));
  const lastDate = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date, lastDate));
  return target.toISOString().slice(0, 10);
}

/** A moment in time as "25 نوفمبر · 3:40 م" on the given clock. */
export function formatMoment(moment: string | Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(moment));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const day = `${part('year')}-${part('month')}-${part('day')}`;
  return `${formatShortDay(day)} · ${formatMinute(Number(part('hour')) * 60 + Number(part('minute')))}`;
}
