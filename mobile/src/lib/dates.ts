/** 本地时区的 YYYY-MM-DD（不要用 toISOString，会因 UTC 偏移导致日期错误） */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** b - a 的天数差 */
export function diffDays(a: string, b: string): number {
  const ms = parseDate(b).getTime() - parseDate(a).getTime();
  return Math.round(ms / 86400000);
}

export function formatChineseDate(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function weekdayName(dateStr: string): string {
  return `周${WEEKDAYS[parseDate(dateStr).getDay()]}`;
}
