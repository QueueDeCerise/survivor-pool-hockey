import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDayPoints } from '@/lib/nhl';
import { closeDay } from '@/lib/closeDay';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Appelé automatiquement par Supabase toutes les 10 minutes.
// Ferme chaque journée dont tous les matchs sont terminés.
async function handler(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'non autorisé' }, { status: 401 });
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante dans Vercel' }, { status: 500 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const startedBefore = new Date(Date.now() - 2 * 3600000).toISOString();

  const { data: days, error } = await sb.from('game_days')
    .select('game_date, first_game_at')
    .is('closed_at', null)
    .gte('game_date', since)
    .lt('first_game_at', startedBefore)
    .order('game_date');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = [];
  for (const d of days || []) {
    try {
      const res = await getDayPoints(d.game_date);
      if (!res.allFinal) { out.push({ date: d.game_date, statut: 'matchs non terminés' }); continue; }
      const r = await closeDay(sb, d.game_date, res.points);
      out.push({ date: d.game_date, statut: 'fermée', ...r });
    } catch (e) {
      out.push({ date: d.game_date, erreur: String(e.message || e) });
    }
  }
  return NextResponse.json({ ok: true, journees: out });
}

export const GET = handler;
export const POST = handler;
