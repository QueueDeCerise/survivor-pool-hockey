import { TIMEZONE, LATE_PICK_MINUTES } from './config';

export function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fmtDate(dateStr, opts = {}) {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', ...opts }).format(new Date(dateStr + 'T12:00:00Z'));
}

export function fmtShort(dateStr) {
  return fmtDate(dateStr, { weekday: 'short', month: 'short' });
}

export function fmtTime(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('fr-CA', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
}

export function fmtDateTime(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('fr-CA', { timeZone: TIMEZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
}

export function lateLimit(firstGameAt) {
  return new Date(new Date(firstGameAt).getTime() + LATE_PICK_MINUTES * 60000).toISOString();
}

export const displayName = (p) => (p && (p.nickname || p.first_name)) || '';
