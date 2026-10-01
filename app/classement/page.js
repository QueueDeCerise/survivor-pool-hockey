'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { todayLocal, fmtDate, fmtShort } from '@/lib/time';

const OUTCOME = { survie: ['Survit', 'ok'], sans_point: ['Sans point', 'bad'], doublon: ['Doublon', 'bad'], aucun_choix: ['Aucun choix', 'bad'] };

function Standings() {
  const [rounds, setRounds] = useState([]);
  const [roundId, setRoundId] = useState(null);
  const [rows, setRows] = useState([]);
  const [pot, setPot] = useState(0);
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
    supabase.rpc('round_pot', { p_round: round.id }).then(({ data }) => setPot(Number(data) || 0));
    supabase.from('game_days').select('game_date, first_game_at').gte('game_date', round.start_date).lte('game_date', todayLocal()).order('game_date', { ascending: false }).limit(30)
      .then(({ data }) => { setDays(data || []); setDate((data || [])[0] ? data[0].game_date : null); });
  }, [roundId]); // eslint-disable-line

  useEffect(() => {
    if (!round || !date) { setReveal(null); return; }
    supabase.rpc('revealed_picks', { p_round: round.id, p_date: date }).then(({ data }) => setReveal(data || []));
  }, [date, roundId]); // eslint-disable-line

  const alive = rows.filter((r) => r.lives > 0).length;

  return (
    <main className="page">
      {rounds.length > 1 && (
        <div className="chips">
          {rounds.map((r) => <button key={r.id} className={'chip' + (r.id === roundId ? ' on' : '')} onClick={() => setRoundId(r.id)}>Ronde {r.number}<small>{r.status === 'terminee' ? 'terminée' : r.status === 'en_cours' ? 'en cours' : 'inscriptions'}</small></button>)}
        </div>
      )}
      {!round ? <div className="msg info">Aucune ronde pour l’instant.</div> : (
        <>
          <div>
            <div className="eyebrow">Ronde {round.number} · début {fmtDate(round.start_date)}</div>
            <h1><span className="mono">{pot} $</span> dans la cagnotte</h1>
            <div className="fine">{alive} survivant{alive > 1 ? 's' : ''} sur {rows.length}</div>
          </div>
          <section className="panel">
            <h2>Classement</h2>
            <div className="list">
              {rows.map((r, i) => (
                <div className="line" key={i}>
                  <span className="t">{r.display_name}{r.is_me && <span className="fine"> (toi)</span>}</span>
                  {r.lives > 0
                    ? <span className="lives">{[0, 1, 2].map((k) => <i key={k} className={'life' + (k >= r.lives ? ' off' : '')} />)}</span>
                    : <span className="badge bad">PATINAPU</span>}
                </div>
              ))}
              {rows.length === 0 && <div className="fine">Aucun participant inscrit.</div>}
            </div>
          </section>
          <section className="panel stack">
            <h2>Révélation des choix</h2>
            {days.length > 0 && (
              <div className="chips">
                {days.map((d) => <button key={d.game_date} className={'chip' + (d.game_date === date ? ' on' : '')} onClick={() => setDate(d.game_date)}>{fmtShort(d.game_date)}</button>)}
              </div>
            )}
            {!reveal || reveal.length === 0 ? (
              <div className="msg info">Les choix sont privés en ce moment. Ils apparaissent 30 minutes après le début du premier match, jusqu’à 90 minutes après la fin du dernier.</div>
            ) : (
              <div className="list">
                {reveal.map((r, i) => (
                  <div className="line" key={i}>
                    <div><div className="t">{r.display_name}</div><div className="s">{r.player_name}</div></div>
                    <div className="row" style={{ flex: 'none', gap: 6 }}>
                      {r.doublon && <span className="badge bad">DOUBLON</span>}
                      {r.outcome && <span className={'badge ' + OUTCOME[r.outcome][1]}>{OUTCOME[r.outcome][0]}</span>}
                    </div>
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
