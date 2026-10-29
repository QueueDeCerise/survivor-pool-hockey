import { COMMISSAIRE_GMAIL } from '@/lib/config';

// Lien qui ouvre une fenêtre de rédaction Gmail (au lieu du logiciel de courriel par défaut)
export function gmailHref({ to = [], bcc = [], subject = '', body = '' } = {}) {
  const list = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean).join(',');
  const p = new URLSearchParams({ view: 'cm', fs: '1' });
  if (list(to)) p.set('to', list(to));
  if (list(bcc)) p.set('bcc', list(bcc));
  if (subject) p.set('su', subject);
  if (body) p.set('body', body);
  if (COMMISSAIRE_GMAIL) p.set('authuser', COMMISSAIRE_GMAIL);
  return 'https://mail.google.com/mail/?' + p.toString();
}

// Lien classique (logiciel de courriel par défaut), en solution de rechange
export function mailtoHref({ to = [], bcc = [], subject = '', body = '' } = {}) {
  const list = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean).map(encodeURIComponent).join(',');
  const q = [];
  if (list(bcc)) q.push('bcc=' + list(bcc));
  if (subject) q.push('subject=' + encodeURIComponent(subject));
  if (body) q.push('body=' + encodeURIComponent(body));
  return 'mailto:' + list(to) + (q.length ? '?' + q.join('&') : '');
}
