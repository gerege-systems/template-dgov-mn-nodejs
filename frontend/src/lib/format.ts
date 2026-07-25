// Монгол локалийн огноо/цаг туслахууд — server ба client component-уудад хуваалцана.
//
// Бүх туслах Asia/Ulaanbaatar (UTC+08)-д бэхлэгдэнэ. Server нь UTC-д, browser нь
// ихэвчлэн UTC+08-д ажилладаг тул цагийн бүсийг тодорхой заахгүй бол SSR HTML
// болон client дахин render зөрж React hydration алдаа (418/423/425) гарна.
// Цагийн бүсийг бэхлэснээр хоёр тал ижил үлдэнэ.

const WEEKDAYS_MN = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
const TZ = 'Asia/Ulaanbaatar';

function parts(d: Date | string): { year: string; month: string; day: string; hour: string; minute: string; weekdayIdx: number } {
  const x = typeof d === 'string' ? new Date(d) : d;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(x)) if (p.type !== 'literal') map[p.type] = p.value;
  const dayName = (map.weekday ?? '').toLowerCase();
  const idxByEN: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return {
    year:       map.year   ?? '',
    month:      map.month  ?? '',
    day:        map.day    ?? '',
    hour:       map.hour   ?? '',
    minute:     map.minute ?? '',
    weekdayIdx: idxByEN[dayName.slice(0, 3)] ?? 0,
  };
}

/** "2026 оны 5 сарын 22". */
export function formatDateMN(d: Date | string): string {
  const p = parts(d);
  return `${p.year} оны ${Number(p.month)} сарын ${Number(p.day)}`;
}

/** "Лхагва гариг". */
export function formatWeekdayMN(d: Date | string): string {
  const p = parts(d);
  return `${WEEKDAYS_MN[p.weekdayIdx]} гариг`;
}

/** "2026-04-12 08:34" (үргэлж Ulaanbaatar / UTC+08). */
export function formatTS(d: Date | string): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** "johndoe" → "JO" — нэр / нэвтрэх нэрнээс эхний үсгүүд (Cyrillic-safe). */
export function initialsOf(name: string): string {
  const segs = (name ?? '').trim().split(/[\s._-]+/).filter(Boolean);
  if (segs.length === 0) return '?';
  if (segs.length === 1) return segs[0].slice(0, 2).toUpperCase();
  return (segs[0][0] + segs[1][0]).toUpperCase();
}
