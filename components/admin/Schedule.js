'use client';
import { useEffect, useState } from 'react';
import { supabase, frError } from '@/lib/supabase';
import { closeDay } from '@/lib/closeDay';
import { todayLocal, addDays, fmtDate, fmtTime, fmtDateTime } from '@/lib/time';

export default function Schedule() {
  const [from, setFrom] = useState(todayLocal());
  const [days, setDays] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    const { data } = await supabase.from('game_days').select('*').gte('game_date', addDays(todayLocal(), -5)).order('game_date').limit(40);
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

  async function closeNow(d) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/nhl/points?date=${d.game_date}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur NHL');
      if (!json.allFinal && !confirm('Certains matchs ne sont pas terminés selon la NHL. Fermer la journée quand même?')) return;
      const r = await closeDay(supabase, d.game_date, json.points);
      setMsg({ t: 'ok', m: `Journée fermée: ${r.points} joueur(s) avec des points, classement recalculé pour ${r.rounds} ronde(s).${r.unmatched.length ? ' Non trouvés: ' + r.unmatched.join(', ') : ''}` });
      load();
    } catch (e) { setMsg({ t: 'err', m: frError(e) }); } finally { setBusy(false); }
  }

  const now = Date.now();

  return (
    <>
      <section className="panel stack">
        <h2>Importer l’horaire NHL</h2>
        <div className="row">
          <input className="field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <button className="btn" disabled={busy} onClick={importWeek}>{busy ? 'Un instant…' : 'Importer 7 jours'}</button>
        </div>
        <p className="fine">Chaque journée se ferme toute seule quand tous les matchs sont terminés (vérification aux 10 minutes): les points sont calculés et le classement est mis à jour. Tu peux aussi la fermer toi-même.</p>
        {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      </section>
      <section className="panel">
        <h2>Journées</h2>
        <div className="list">
          {days.map((d) => {
            const started = now >= new Date(d.first_game_at).getTime();
            return (
              <div className="line" key={d.game_date}>
                <div>
                  <div className="t">{fmtDate(d.game_date)}</div>
                  <div className="s">{(d.games || []).length} match(s) · 1er à {fmtTime(d.first_game_at)}</div>
                </div>
                {d.closed_at
                  ? <span className="badge ok">Fermée {fmtDateTime(d.closed_at)}</span>
                  : started
                    ? <button className="btn secondary small" disabled={busy} onClick={() => closeNow(d)}>Fermer la journée</button>
                    : <span className="badge">À venir</span>}
              </div>
            );
          })}
          {days.length === 0 && <div className="fine">Aucune journée. Importe l’horaire ci-dessus.</div>}
        </div>
      </section>
    </>
  );
}
