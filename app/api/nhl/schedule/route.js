import { NextResponse } from 'next/server';
import { nhl, txt } from '@/lib/nhl';

export const dynamic = 'force-dynamic';

// GET /api/nhl/schedule?date=YYYY-MM-DD -> semaine de matchs à partir de cette date
export async function GET(req) {
  const date = new URL(req.url).searchParams.get('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return NextResponse.json({ error: 'date invalide' }, { status: 400 });
  try {
    const data = await nhl(`/schedule/${date}`);
    const days = (data.gameWeek || [])
      .map((d) => {
        const games = (d.games || [])
          .filter((g) => g.gameType === 2 || g.gameType === 3)
          .map((g) => ({ away: g.awayTeam?.abbrev || txt(g.awayTeam?.placeName), home: g.homeTeam?.abbrev || txt(g.homeTeam?.placeName), start: g.startTimeUTC }))
          .sort((a, b) => a.start.localeCompare(b.start));
        return { game_date: d.date, games, first_game_at: games[0]?.start || null };
      })
      .filter((d) => d.games.length > 0);
    return NextResponse.json({ days });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
