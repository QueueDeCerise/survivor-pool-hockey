// Ferme une journée: enregistre les points NHL (sans écraser les corrections manuelles)
// puis recalcule les vies de toutes les rondes en cours. Utilisé par le bouton du
// gestionnaire et par la vérification automatique.
export async function closeDay(sb, date, points) {
  const ids = [...new Set((points || []).map((p) => p.nhl_id).filter(Boolean))];
  const map = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('players').select('id, nhl_id').in('nhl_id', ids.slice(i, i + 200));
    if (error) throw error;
    (data || []).forEach((p) => map.set(p.nhl_id, p.id));
  }

  const { data: manual, error: e1 } = await sb.from('point_events').select('player_id').eq('game_date', date).eq('source', 'manuel');
  if (e1) throw e1;
  const manualSet = new Set((manual || []).map((x) => x.player_id));

  const rows = [];
  const unmatched = [];
  for (const p of points || []) {
    const id = map.get(p.nhl_id);
    if (!id) { unmatched.push(p.name); continue; }
    if (manualSet.has(id)) continue; // une correction manuelle a priorité
    rows.push({ player_id: id, game_date: date, goals: p.goals, assists: p.assists, source: 'nhl', updated_at: new Date().toISOString() });
  }

  // Retire les anciens points NHL qui n'existent plus (correction officielle de la ligue)
  let del = sb.from('point_events').delete().eq('game_date', date).eq('source', 'nhl');
  if (rows.length) del = del.not('player_id', 'in', `(${rows.map((r) => r.player_id).join(',')})`);
  const { error: e2 } = await del;
  if (e2) throw e2;

  if (rows.length) {
    const { error: e3 } = await sb.from('point_events').upsert(rows, { onConflict: 'player_id,game_date' });
    if (e3) throw e3;
  }

  const { data: rounds, error: e4 } = await sb.rpc('close_day', { p_date: date });
  if (e4) throw e4;
  return { points: rows.length, unmatched, rounds: rounds || 0 };
}
