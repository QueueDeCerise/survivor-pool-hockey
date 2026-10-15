'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { todayLocal, fmtShort } from '@/lib/time';
import s from './du-jour.module.css';

const OUTCOME = { survie: ['Survit', 'ok'], sans_point: ['Sans point', 'bad'], doublon: ['Perdu', 'bad'], aucun_choix: ['TARO', 'bad'] };
const TARO = 'TARO TSUJIMOTO';

function DailyPicks() {
  const [rounds, setRounds] = useState([]);
  const [roundId, setRoundId] = useState(null);
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState([]);
  const [date, setDate] = useState(null);
  const [reveal, setReveal] = useState(null);

  useEffect(() => {
    supabase.from('rounds').select('*').order('number', { ascending: false }).then(({ data }) => {
      setRounds(data || []);
      const active = (data || []).find((r) => r.status === 'en_cours') || (data || [])[0];
      if (active) setRoundId(active.id);
    });
  }, []);

  const round = rounds.find((r) => r.id === roundId);

  useEffect(() => {
    if (!round) return;
    supabase.rpc('standings', { p_round: round.id }).then(({ data }) => setRows(data || []));
    supabase.from('game_days').select('game_date, first_game_at, closed_at').gte('game_date', round.start_date).lte('game_date', todayLocal()).order('game_date', { ascending: false }).limit(30)
      .then(({ data }) => { setDays(data || []); setDate((data || [])[0] ? data[0].game_date : null); });
  }, [roundId]); // eslint-disable-line

  useEffect(() => {
    if (!round || !date) { setReveal(null); return; }
    supabase.rpc('revealed_picks', { p_round: round.id, p_date: date }).then(({ data }) => setReveal(data || []));
  }, [date, roundId]); // eslint-disable-line

  // Participants encore en vie sans prédiction: TARO TSUJIMOTO (avant la fermeture de la journée).
  const day = days.find((d) => d.game_date === date);
  const first = day && day.first_game_at ? new Date(day.first_game_at).getTime() : null;
  const windowOpen = !!day && !day.closed_at && first !== null && Date.now() >= first + 30 * 60000;
  let list = (reveal || []).map((r) => (/^taro tsujimoto$/i.test((r.player_name || '').trim()) ? { ...r, player_name: TARO, taro: true } : r));
  if (round && round.status !== 'terminee' && (list.length > 0 || windowOpen) && day && !day.closed_at) {
    const have = new Set(list.map((r) => r.display_name));
    const missing = rows.filter((r) => r.lives > 0 && !have.has(r.display_name))
      .map((r) => ({ display_name: r.display_name, player_name: TARO, doublon: false, outcome: 'aucun_choix', taro: true }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'));
    list = [...list, ...missing];
  }

  return (
    <main className="page">
      {rounds.length > 1 && (
        <div className="chips">
          {rounds.map((r) => <button key={r.id} className={'chip' + (r.id === roundId ? ' on' : '')} onClick={() => setRoundId(r.id)}>Ronde {r.number}<small>{r.status === 'terminee' ? 'terminée' : r.status === 'en_cours' ? 'en cours' : 'inscriptions'}</small></button>)}
        </div>
      )}
      {!round ? <div className="msg info">Aucune ronde pour l’instant.</div> : (
        <section className="panel stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Prédictions du jour</h2>
            {list.length > 0 && <span className={s.count} style={{ flex: 'none' }}>{list.length} participant{list.length > 1 ? 's' : ''}</span>}
          </div>
          {days.length > 0 && (
            <div className="chips">
              {days.map((d) => <button key={d.game_date} className={'chip' + (d.game_date === date ? ' on' : '')} onClick={() => setDate(d.game_date)}>{fmtShort(d.game_date)}</button>)}
            </div>
          )}
          {list.length === 0 ? (
            <div className="msg info">Les choix sont privés en ce moment. Ils apparaissent 30 minutes après le début du premier match, jusqu’à 60 minutes après la fermeture de la journée.</div>
          ) : (
            <div className={s.picks}>
              {list.map((r, i) => (
                <div className={s.pick + (r.taro ? ' ' + s.taro : '')} key={i}>
                  <span className={s.line} title={`${r.display_name} — ${r.player_name}`}>
                    <span className={s.who}>{r.display_name}</span><span className={s.sep}>—</span>{r.player_name}
                  </span>
                  <span className={s.tags}>
                    {r.doublon && <span className={s.tag + ' ' + s.dup}>Doublon</span>}
                    {r.outcome && OUTCOME[r.outcome] && !(r.doublon && r.outcome === 'doublon') && <span className={s.tag + ' ' + s[OUTCOME[r.outcome][1]]}>{OUTCOME[r.outcome][0]}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default function Page() {
  return <AppShell><DailyPicks /></AppShell>;
}
