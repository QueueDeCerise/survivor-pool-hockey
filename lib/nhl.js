// Accès à l'API publique NHL (côté serveur seulement, évite les problèmes CORS)
const BASE = 'https://api-web.nhle.com/v1';

export const TEAMS = ['ANA','BOS','BUF','CGY','CAR','CHI','COL','CBJ','DAL','DET','EDM','FLA','LAK','MIN','MTL','NSH','NJD','NYI','NYR','OTT','PHI','PIT','SJS','SEA','STL','TBL','TOR','UTA','VAN','VGK','WSH','WPG'];

export async function nhl(path) {
  const res = await fetch(BASE + path, { cache: 'no-store', headers: { 'User-Agent': 'survivor-pool-hockey' } });
  if (!res.ok) throw new Error(`NHL ${path}: ${res.status}`);
  return res.json();
}

export const txt = (v) => (v && typeof v === 'object' ? v.default || '' : v || '');
export const POS = { C: 'C', L: 'AG', R: 'AD', D: 'D', G: 'G' };
