import { NextResponse } from 'next/server';
import { nhl, txt, TEAMS, POS } from '@/lib/nhl';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/nhl/players -> alignements actuels des 32 équipes (l'équipe n'est pas renvoyée)
export async function GET() {
  const failed = [];
  const players = [];
  const results = await Promise.allSettled(TEAMS.map((t) => nhl(`/roster/${t}/current`)));
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') { failed.push(TEAMS[i]); return; }
    for (const group of ['forwards', 'defensemen', 'goalies']) {
      for (const p of r.value[group] || []) {
        players.push({ nhl_id: p.id, full_name: `${txt(p.firstName)} ${txt(p.lastName)}`.trim(), position: POS[p.positionCode] || p.positionCode });
      }
    }
  });
  const unique = [...new Map(players.map((p) => [p.nhl_id, p])).values()];
  return NextResponse.json({ players: unique, failed });
}
