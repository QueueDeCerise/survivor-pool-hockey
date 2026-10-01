import { NextResponse } from 'next/server';
import { nhl, txt } from '@/lib/nhl';

export const dynamic = 'force-dynamic';

// GET /api/nhl/points?date=YYYY-MM-DD -> buts et passes admissibles (réglementaire + prolongation)
export async function GET(req) {
  const date = new URL(req.url).searchParams.get('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return NextResponse.json({ error: 'date invalide' }, { status: 400 });
  try {
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
        if (type === 'SO') continue; // les buts en fusillade ne comptent pas
        const scorer = [txt(goal.firstName), txt(goal.lastName)].filter(Boolean).join(' ') || txt(goal.name);
        add(goal.playerId, scorer, 'goals');
        for (const a of goal.assists || []) {
          const an = [txt(a.firstName), txt(a.lastName)].filter(Boolean).join(' ') || txt(a.name);
          add(a.playerId, an, 'assists');
        }
      }
      return { away: g.awayTeam?.abbrev, home: g.homeTeam?.abbrev, state: g.gameState, score: `${g.awayTeam?.score ?? '-'}-${g.homeTeam?.score ?? '-'}` };
    });
    const allFinal = games.length > 0 && games.every((g) => g.state === 'OFF' || g.state === 'FINAL');
    return NextResponse.json({ games, allFinal, points: [...map.values()] });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
