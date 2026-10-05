import { NextResponse } from 'next/server';
import { getDayPoints } from '@/lib/nhl';

export const dynamic = 'force-dynamic';

// GET /api/nhl/points?date=YYYY-MM-DD
export async function GET(req) {
  const date = new URL(req.url).searchParams.get('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return NextResponse.json({ error: 'date invalide' }, { status: 400 });
  try {
    return NextResponse.json(await getDayPoints(date));
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
