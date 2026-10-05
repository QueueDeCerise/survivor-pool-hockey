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

// États d'un match qui n'est pas encore terminé
const PENDING = ['FUT', 'PRE', 'LIVE', 'CRIT'];

// Buts et passes admissibles d'une journée (temps réglementaire + prolongation, fusillade exclue)
export async function getDayPoints(date) {
  const data = await nhl(`/score/${date}`);
  const map = new Map();
  const add = (id, name, key) => {
    if (!id) return;
    const row = map.get(id) || { nhl_id: id, name, goals: 0, assists: 0 };
    if (!row.name && name) row.name = name;
    row[key] += 1;
    map.set(id, row);
  };
  const games = (data.games || []).map((g) => {
    for (const goal of g.goals || []) {
      const type = goal.periodDescriptor?.periodType || (goal.period > 4 ? 'SO' : 'REG');
      if (type === 'SO') continue;
      const scorer = [txt(goal.firstName), txt(goal.lastName)].filter(Boolean).join(' ') || txt(goal.name);
      add(goal.playerId, scorer, 'goals');
      for (const a of goal.assists || []) {
        const an = [txt(a.firstName), txt(a.lastName)].filter(Boolean).join(' ') || txt(a.name);
        add(a.playerId, an, 'assists');
      }
    }
    return { away: g.awayTeam?.abbrev, home: g.homeTeam?.abbrev, state: g.gameState, score: `${g.awayTeam?.score ?? '-'}-${g.homeTeam?.score ?? '-'}` };
  });
  const allFinal = games.length > 0 && games.every((g) => !PENDING.includes(g.state));
  return { games, allFinal, points: [...map.values()] };
}
