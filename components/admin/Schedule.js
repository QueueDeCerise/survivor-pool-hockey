'use client';
import { useEffect, useState } from 'react';
import { supabase, frError } from '@/lib/supabase';
import { todayLocal, addDays, fmtDate, fmtTime, fmtDateTime } from '@/lib/time';

export default function Schedule() {
  const [from, setFrom] = useState(todayLocal());
  const [days, setDays] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    const { data } = await supabase.from('game_days').select('*').gte('game_date', addDays(todayLocal(), -3)).order('game_date').limit(40);
    setDays(data || []);
  }
  useEffect(() => { load(); }, []);

  async function importWeek() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/nhl/schedule?date=${from}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur NHL');
      if (!json.days.length) { setMsg({ t: 'info', m: 'Aucun match trouvé pour cette semaine.' }); return; }
      const { error } = await supabase.from('game_days').upsert(json.days.map((d) => ({ game_date: d.game_date, first_game_at: d.first_game_at, games: d.games })), { onConflict: 'game_date' });
      if (error) throw error;
      setMsg({ t: 'ok', m: `${json.days.length} journée(s) importée(s).` });
      setFrom(addDays(from, 7));
      load();
    } catch (e) { setMsg({ t: 'err', m: frError(e) }); } finally { setBusy(false); }
  }

  async function markEnd(d) {
    const { error } = await supabase.from('game_days').update({ last_game_end_at: new Date().toISOString() }).eq('game_date', d.game_date);
    if (error) return setMsg({ t: 'err', m: frError(error) });
    load();
  }

  return (
    <>
      <section className="panel stack">
        <h2>Importer l’horaire NHL</h2>
        <div className="row">
          <input className="field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <button className="btn" disabled={busy} onClick={importWeek}>{busy ? 'Import…' : 'Importer 7 jours'}</button>
        </div>
        <p className="fine">L’heure du premier match fixe l’heure limite des choix. La fin du dernier match fixe la fin de la révélation (+90 min); sans elle, on estime premier match + 6 h.</p>
        {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      </section>
      <section className="panel">
        <h2>Journées</h2>
        <div className="list">
          {days.map((d) => (
            <div className="line" key={d.game_date}>
              <div>
                <div className="t">{fmtDate(d.game_date)}</div>
                <div className="s">{(d.games || []).length} match(s) · 1er à {fmtTime(d.first_game_at)} · {d.last_game_end_at ? `fin ${fmtDateTime(d.last_game_end_at)}` : 'fin non marquée'}</div>
              </div>
              {!d.last_game_end_at && <button className="btn secondary small" onClick={() => markEnd(d)}>Dernier match terminé</button>}
            </div>
          ))}
          {days.length === 0 && <div className="fine">Aucune journée. Importe l’horaire ci-dessus.</div>}
        </div>
      </section>
    </>
  );
}
