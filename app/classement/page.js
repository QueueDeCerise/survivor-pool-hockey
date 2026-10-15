'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Lives from '@/components/Lives';
import Champion from '@/components/Champion';
import { supabase } from '@/lib/supabase';
import { todayLocal, fmtDate, fmtShort } from '@/lib/time';
import s from './classement.module.css';

const OUTCOME = { survie: ['Survit', 'ok'], sans_point: ['Sans point', 'bad'], doublon: ['Perdu', 'bad'], aucun_choix: ['TARO', 'bad'] };

function Standings() {
  const [rounds, setRounds] = useState([]);
  const [roundId, setRoundId] = useState(null);
  const [rows, setRows] = useState([]);
  const [pot, setPot] = useState(0);
  const [days, setDays] = useState([]);
  const [date, setDate] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [champs, setChamps] = useState([]);
  const [tie, setTie] = useState(null);

  useEffect(() => {
    supabase.from('rounds').select('*').order('number', { ascending: false }).then(({ data }) => {
      setRounds(data || []);
      const active = (data || []).find((r) => r.status === 'en_cours') || (data || [])[0];
      if (active) setRoundId(active.id);
    });
    supabase.rpc('round_champions').then(({ data }) => setChamps(data || []));
  }, []);

  const round = rounds.find((r) => r.id === roundId);
  const champ = champs.find((c) => c.round_id === roundId);

  useEffect(() => {
    if (!round) return;
    supabase.rpc('standings', { p_round: round.id }).then(({ data }) => setRows(data || []));
    supabase.rpc('round_pot', { p_round: round.id }).then(({ data }) => setPot(Number(data) || 0));
    supabase.rpc('round_tie', { p_round: round.id }).then(({ data }) => setTie((data || [])[0] || null));
    supabase.from('game_days').select('game_date, first_game_at, closed_at').gte('game_date', round.start_date).lte('game_date', todayLocal()).order('game_date', { ascending: false }).limit(30)
      .then(({ data }) => { setDays(data || []); setDate((data || [])[0] ? data[0].game_date : null); });
  }, [roundId]); // eslint-disable-line

  useEffect(() => {
    if (!round || !date) { setReveal(null); return; }
    supabase.rpc('revealed_picks', { p_round: round.id, p_date: date }).then(({ data }) => setReveal(data || []));
  }, [date, roundId]); // eslint-disable-line

  const alive = rows.filter((r) => r.lives > 0).length;

  // Participants encore en vie sans prédiction: TARO TSUJIMOTO (avant la fermeture de la journée).
  const TARO = 'TARO TSUJIMOTO';
  const day = days.find((d) => d.game_date === date);
  const now = Date.now();
  const first = day && day.first_game_at ? new Date(day.first_game_at).getTime() : null;
  const windowOpen = !!day && !day.closed_at && first !== null && now >= first + 30 * 60000;
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
        <>
          {champ ? (
            <Champion name={champ.display_name} round={champ.round_number} pot={champ.pot} winners={champ.winners} share={champ.share} />
          ) : (
            <div>
              <div className="eyebrow">Ronde {round.number} · début {fmtDate(round.start_date)}</div>
              <h1><span className="mono">{pot} $</span> dans la cagnotte</h1>
              <div className="fine">{alive} survivant{alive > 1 ? 's' : ''} sur {rows.length}</div>
            </div>
          )}
          {!champ && tie && tie.tie_status === 'decision' && (
            <div className="msg warn"><b>Égalité!</b> {tie.finalists} ont perdu leur dernière vie le même jour. Les finalistes choisissent: partage de la cagnotte (à l’unanimité) ou prolongation.</div>
          )}
          {!champ && tie && tie.tie_status === 'prolongation' && (
            <div className="msg info"><b>Prolongation · jour {Math.min(5, (tie.overtime_day || 0) + 1)} de 5.</b> Une vie chacun, mort subite. Le dernier survivant l’emporte.</div>
          )}
          <section className="panel">
            <h2>Classement</h2>
            <div className="list">
              {rows.map((r, i) => {
                const isChamp = champ && champ.display_name.split(' · ').includes(r.display_name);
                return (
                  <div className="line" key={i}>
                    <span className="t">{isChamp && '🏆 '}{r.display_name}{r.is_me && <span className="fine"> (toi)</span>}</span>
                    {r.lives > 0 ? <Lives n={r.lives} /> : <span className="badge bad">PATINAPU</span>}
                  </div>
                );
              })}
              {rows.length === 0 && <div className="fine">Aucun participant inscrit.</div>}
            </div>
          </section>
          <section className="panel stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>Prédictions des participants</h2>
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
                      {r.outcome && !(r.doublon && r.outcome === 'doublon') && <span className={s.tag + ' ' + s[OUTCOME[r.outcome][1]]}>{OUTCOME[r.outcome][0]}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default function Page() {
  return <AppShell><Standings /></AppShell>;
}
