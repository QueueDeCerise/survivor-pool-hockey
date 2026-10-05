'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase, fetchAll, frError } from '@/lib/supabase';
import { todayLocal, addDays, fmtShort } from '@/lib/time';

export default function Points() {
  const [days, setDays] = useState([]);
  const [date, setDate] = useState(null);
  const [players, setPlayers] = useState([]);
  const [rows, setRows] = useState([]);
  const [games, setGames] = useState(null);
  const [unmatched, setUnmatched] = useState([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('game_days').select('game_date, closed_at').lte('game_date', todayLocal()).gte('game_date', addDays(todayLocal(), -30)).order('game_date', { ascending: false });
      setDays(data || []);
      if (data && data[0]) setDate(data[0].game_date);
      setPlayers(await fetchAll(() => supabase.from('players').select('id, nhl_id, full_name, position').eq('approved', true).eq('is_default', false)));
    })();
  }, []);

  async function loadRows(d) {
    const { data } = await supabase.from('point_events').select('*').eq('game_date', d);
    setRows(data || []);
  }

  useEffect(() => {
    if (!date) return;
    setGames(null); setUnmatched([]); setMsg(null);
    loadRows(date);
  }, [date]);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const byNhl = useMemo(() => new Map(players.filter((p) => p.nhl_id).map((p) => [p.nhl_id, p])), [players]);
  const day = days.find((d) => d.game_date === date);

  async function importNhl() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/nhl/points?date=${date}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur NHL');
      setGames(json);
      const next = new Map(rows.map((r) => [r.player_id, { ...r }]));
      const miss = [];
      for (const p of json.points) {
        const pl = byNhl.get(p.nhl_id);
        if (!pl) { miss.push(p); continue; }
        const cur = next.get(pl.id);
        if (cur && cur.source === 'manuel') continue; // la correction manuelle a priorité
        next.set(pl.id, { player_id: pl.id, game_date: date, goals: p.goals, assists: p.assists, source: 'nhl' });
      }
      setRows([...next.values()]);
      setUnmatched(miss);
      setMsg({ t: json.allFinal ? 'ok' : 'warn', m: `${json.points.length} marqueur(s) trouvé(s). ${json.allFinal ? 'Tous les matchs sont terminés.' : 'Des matchs ne sont pas terminés.'} Vérifie puis enregistre.` });
    } catch (e) { setMsg({ t: 'err', m: frError(e) }); } finally { setBusy(false); }
  }

  const edit = (id, key, val) => setRows((rs) => rs.map((r) => (r.player_id === id ? { ...r, [key]: Math.max(0, Number(val) || 0), source: 'manuel' } : r)));
  const addPlayer = (p) => { if (!rows.find((r) => r.player_id === p.id)) setRows([...rows, { player_id: p.id, game_date: date, goals: 0, assists: 0, source: 'manuel' }]); setSearch(''); };

  async function saveAndScore() {
    setBusy(true); setMsg(null);
    try {
      const payload = rows.map((r) => ({ player_id: r.player_id, game_date: date, goals: r.goals, assists: r.assists, source: r.source || 'manuel', updated_at: new Date().toISOString() }));
      if (payload.length) {
        const { error } = await supabase.from('point_events').upsert(payload, { onConflict: 'player_id,game_date' });
        if (error) throw error;
      }
      const { data, error } = await supabase.rpc('close_day', { p_date: date });
      if (error) throw error;
      setMsg({ t: 'ok', m: `${payload.length} ligne(s) de points enregistrée(s). Classement recalculé pour ${data || 0} ronde(s).` });
      setDays((ds) => ds.map((d) => (d.game_date === date && !d.closed_at ? { ...d, closed_at: new Date().toISOString() } : d)));
      loadRows(date);
    } catch (e) { setMsg({ t: 'err', m: frError(e) }); } finally { setBusy(false); }
  }

  const found = search.trim().length > 1 ? players.filter((p) => p.full_name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8) : [];
  const sorted = [...rows].sort((a, b) => (byId.get(a.player_id)?.full_name || '').localeCompare(byId.get(b.player_id)?.full_name || ''));

  return (
    <section className="panel stack">
      <h2>Points admissibles</h2>
      <div className="chips">{days.map((d) => <button key={d.game_date} className={'chip' + (d.game_date === date ? ' on' : '') + (d.closed_at ? ' has' : '')} onClick={() => setDate(d.game_date)}>{fmtShort(d.game_date)}<small>{d.closed_at ? 'fermée' : 'ouverte'}</small></button>)}</div>
      {!date ? <div className="fine">Aucune journée passée. Importe l’horaire d’abord.</div> : (
        <>
          <p className="fine">Les points sont calculés automatiquement à la fermeture de la journée. Utilise cette page seulement pour corriger: une correction manuelle n’est jamais écrasée par la NHL. Buts et passes en temps réglementaire et prolongation seulement, fusillade exclue.</p>
          <div className="row">
            <button className="btn secondary" disabled={busy} onClick={importNhl}>Réimporter depuis la NHL</button>
            <button className="btn" disabled={busy} onClick={saveAndScore}>{day && day.closed_at ? 'Enregistrer et recalculer' : 'Enregistrer et fermer la journée'}</button>
          </div>
          {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
          {games && <div className="fine">{games.games.map((g) => `${g.away} ${g.score} ${g.home} (${g.state})`).join(' · ')}</div>}
          {unmatched.length > 0 && <div className="msg warn">Non trouvés dans la liste: {unmatched.map((u) => `${u.name} (${u.goals}B ${u.assists}P)`).join(', ')}. Mets à jour la liste des joueurs puis réimporte.</div>}
          <div style={{ position: 'relative' }}>
            <input className="field" placeholder="Ajouter une correction manuelle: nom du joueur…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {found.length > 0 && <div className="panel" style={{ position: 'absolute', left: 0, right: 0, zIndex: 3, padding: 6 }}>{found.map((p) => <button key={p.id} className="player" onClick={() => addPlayer(p)}><span>{p.full_name}</span><span className="badge">{p.position}</span></button>)}</div>}
          </div>
          <div className="scroll-x">
            <table className="grid">
              <thead><tr><th>Joueur</th><th>Buts</th><th>Passes</th><th>Source</th></tr></thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.player_id}>
                    <td>{byId.get(r.player_id)?.full_name || r.player_id}</td>
                    <td><input className="num" type="number" min="0" value={r.goals} onChange={(e) => edit(r.player_id, 'goals', e.target.value)} /></td>
                    <td><input className="num" type="number" min="0" value={r.assists} onChange={(e) => edit(r.player_id, 'assists', e.target.value)} /></td>
                    <td><span className={'badge' + (r.source === 'manuel' ? ' wait' : '')}>{r.source}</span></td>
                  </tr>
                ))}
                {sorted.length === 0 && <tr><td colSpan="4" className="fine">Aucun point pour cette journée.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
