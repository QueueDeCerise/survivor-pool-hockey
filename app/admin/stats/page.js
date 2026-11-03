'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import StatsBoard from '@/components/StatsBoard';
import { supabase, frError } from '@/lib/supabase';

function Header() {
  return (
    <div>
      <div className="eyebrow">Bureau du commissaire</div>
      <h1>Statistiques</h1>
    </div>
  );
}

function Stats() {
  const [seasonId, setSeasonId] = useState(null);
  const [roundId, setRoundId] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setErr('');
    supabase.rpc('admin_stats', { p_season: seasonId, p_round: roundId }).then(({ data: d, error }) => {
      if (error) { setErr(frError(error)); setData({ totals: {} }); return; }
      setData(d);
    });
  }, [seasonId, roundId]);

  if (!data) return <main className="page"><Header /><div className="fine">Chargement…</div></main>;

  const seasons = data.seasons || [];
  const rounds = data.rounds || [];
  const curSeason = seasons.find((x) => x.id === data.season_id);
  const round = roundId ? rounds.find((r) => r.id === roundId) : null;
  const activeRound = round ? round.status === 'en_cours' : rounds.some((r) => r.status === 'en_cours');
  const pickSeason = (id) => { if (id === data.season_id && !roundId) return; setData(null); setRoundId(null); setSeasonId(id); };
  const pickRound = (id) => { if (id === roundId) return; setData(null); setRoundId(id); };
  const exportName = `statistiques-${(curSeason ? curSeason.name : 'saison').replace(/\s+/g, '-').toLowerCase()}${round ? '-ronde-' + round.number : ''}`;

  return (
    <main className="page">
      <Header />
      {seasons.length > 1 && (
        <div className="chips">
          {seasons.map((x) => (
            <button key={x.id} className={'chip' + (x.id === data.season_id ? ' on' : '')} onClick={() => pickSeason(x.id)}>
              {x.name}<small>{x.is_current ? 'en cours' : 'archivée'}</small>
            </button>
          ))}
        </div>
      )}
      <div className="chips">
        <button className={'chip' + (!roundId ? ' on' : '')} onClick={() => pickRound(null)}>Toute la saison<small>{curSeason ? curSeason.name : ''}</small></button>
        {rounds.map((r) => (
          <button key={r.id} className={'chip' + (r.id === roundId ? ' on' : '')} onClick={() => pickRound(r.id)}>
            Ronde {r.number}<small>{r.status === 'terminee' ? 'terminée' : r.status === 'en_cours' ? 'en cours' : 'inscriptions'}</small>
          </button>
        ))}
      </div>
      {err && <div className="msg err" role="alert">{err}</div>}
      {!(data.totals && data.totals.results) ? <div className="msg info">Pas encore de journée fermée pour cette sélection.</div> : (
        <>
          {activeRound && <div className="msg info">Ronde en cours : ces stats montrent des choix encore cachés aux participants. Garde-les pour toi jusqu’à la fin de la ronde. Les participants, eux, ne voient que les rondes terminées.</div>}
          <StatsBoard data={data} seasonMode={!roundId} exportName={exportName} />
          <p className="fine" style={{ margin: 0 }}>Seules les journées fermées sont comptées. Les participants retirés d’une ronde sont exclus. TARO et doublons ne comptent pas dans les stats des joueurs LNH.</p>
        </>
      )}
    </main>
  );
}

export default function Page() {
  return <AppShell requireAdmin><Stats /></AppShell>;
}
