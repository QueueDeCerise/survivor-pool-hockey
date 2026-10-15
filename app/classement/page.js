'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Lives from '@/components/Lives';
import Champion from '@/components/Champion';
import { supabase } from '@/lib/supabase';
import { fmtDate } from '@/lib/time';

function Standings() {
  const [rounds, setRounds] = useState([]);
  const [roundId, setRoundId] = useState(null);
  const [rows, setRows] = useState([]);
  const [pot, setPot] = useState(0);
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
  }, [roundId]); // eslint-disable-line

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
        </>
      )}
    </main>
  );
}

export default function Page() {
  return <AppShell><Standings /></AppShell>;
}
