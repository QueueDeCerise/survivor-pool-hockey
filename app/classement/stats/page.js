'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import StatsBoard, { Record, pct, pctTxt, plural } from '@/components/StatsBoard';
import { supabase, frError } from '@/lib/supabase';
import { fmtDate } from '@/lib/time';
import s from '@/components/StatsBoard.module.css';

// Mes stats : seulement mes propres chiffres (ronde en cours comprise), aucune comparaison avec les autres
function MyStats() {
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase.rpc('my_stats').then(({ data, error }) => {
      if (error) setErr(frError(error));
      setMe(data || { rounds: [] });
    });
  }, []);

  if (!me) return <div className="fine">Chargement…</div>;
  if (err) return <div className="msg err" role="alert">{err}</div>;
  const rounds = me.rounds || [];
  if (rounds.length === 0) return <div className="msg info">Tu n’es inscrit à aucune ronde cette saison. Tes stats apparaîtront ici dès ta première journée.</div>;

  const sum = (k) => rounds.reduce((t, r) => t + (r[k] || 0), 0);
  const tot = { picks: sum('picks'), survie: sum('survie'), lives_lost: sum('lives_lost'), sans_point: sum('sans_point'), taro: sum('taro'), doublon: sum('doublon'), points: sum('points') };
  const wins = rounds.filter((r) => r.won).length;
  const best = Math.max(0, ...rounds.map((r) => r.best_streak || 0));
  const active = rounds.filter((r) => r.status === 'en_cours');

  const state = (r) => {
    if (r.won) return <span className={`${s.round} ${s.win}`}>🏆 Gagnant</span>;
    if (r.lives <= 0) return <span className={`${s.round} ${s.dead}`}>PATINAPU</span>;
    if (r.status === 'en_cours') return <span className={`${s.round} ${s.alive}`}>En vie · {plural(r.lives, 'vie', 'vies')}</span>;
    if (r.status === 'inscriptions') return <span className={s.round}>Inscrit</span>;
    return <span className={s.round}>Terminée</span>;
  };

  const bestPicks = (me.best_picks || []).map((b) => ({ main: b.player || 'joueur inconnu', detail: `Ronde ${b.ronde} · ${plural(b.points, 'point', 'points')} · ${fmtDate(b.jour)}` }));
  const favs = (me.fav_players || []).map((p) => ({ main: p.name, detail: `${plural(p.picks, 'fois', 'fois')} · ${p.survie} survie${p.survie > 1 ? 's' : ''} · ${plural(p.points, 'point', 'points')}` }));

  return (
    <>
      <div className={s.kpis}>
        <div className={s.kpi}><b>{rounds.length}</b><span>{rounds.length > 1 ? 'rondes jouées' : 'ronde jouée'}</span></div>
        <div className={s.kpi}><b>{wins}</b><span>{wins > 1 ? 'victoires' : 'victoire'}</span></div>
        <div className={s.kpi}><b>{pctTxt(pct(tot.survie, tot.picks))}</b><span>taux de réussite</span></div>
        <div className={s.kpi}><b>{best}</b><span>meilleure série (journées sans perdre de vie)</span></div>
      </div>

      {active.map((r) => (
        <div key={r.round_id} className="msg info">
          <b>Ronde {r.ronde} en cours</b> · {r.lives > 0
            ? <>série actuelle : {plural(r.current_streak || 0, 'journée', 'journées')} · {plural(r.lives, 'vie restante', 'vies restantes')} · réussite {pctTxt(pct(r.survie, r.picks))}</>
            : <>PATINAPU 💀 · tu as tenu {plural(r.days, 'journée', 'journées')}</>}
        </div>
      ))}

      <div className={s.wrap}>
        <table className={s.t}>
          <thead><tr><th className={s.sticky}>Ronde</th><th>État</th><th>Jours</th><th>Réussite</th><th>Meilleure série</th><th>Vies perdues</th><th>0 point</th><th>TARO</th><th>Doublon</th><th>Points</th></tr></thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.round_id}>
                <td className={s.sticky}>Ronde {r.ronde}</td>
                <td>{state(r)}</td>
                <td className={s.num}>{r.days}</td>
                <td className={s.num}>{pctTxt(pct(r.survie, r.picks))}</td>
                <td className={s.num}>{r.best_streak}</td>
                <td className={s.num}>{r.lives_lost}</td>
                <td className={s.num}>{r.sans_point}</td>
                <td className={s.num}>{r.taro}</td>
                <td className={s.num}>{r.doublon}</td>
                <td className={s.num}>{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.grid}>
        <Record emoji="💣" title="Mes meilleurs choix" sub="Rondes terminées seulement" items={bestPicks} empty="Disponible à la fin de ta première ronde." />
        <Record emoji="⭐" title="Mes joueurs fétiches" sub="Rondes terminées seulement" items={favs} empty="Disponible à la fin de ta première ronde." />
      </div>
    </>
  );
}

function Pool() {
  const [roundId, setRoundId] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setErr('');
    supabase.rpc('public_stats', { p_round: roundId }).then(({ data: d, error }) => {
      if (error) { setErr(frError(error)); setData({ totals: {}, rounds: [], pending: [] }); return; }
      setData(d);
    });
  }, [roundId]);

  if (!data) return <div className="fine">Chargement…</div>;
  const rounds = data.rounds || [];
  const pending = (data.pending || []).filter((p) => p.status === 'en_cours');
  const pickRound = (id) => { if (id === roundId) return; setData(null); setRoundId(id); };

  return (
    <>
      {pending.map((p) => (
        <div key={p.number} className={s.secret}>🤐 <b>Ronde {p.number} en cours</b> : ses stats seront dévoilées à la fin. Pas d’indice d’ici là!</div>
      ))}
      {err && <div className="msg err" role="alert">{err}</div>}
      {rounds.length === 0 ? <div className="msg info">Aucune ronde terminée pour l’instant. Les records du pool apparaîtront à la fin de la première ronde.</div> : (
        <>
          <div className="chips">
            <button className={'chip' + (!roundId ? ' on' : '')} onClick={() => pickRound(null)}>Toutes les rondes terminées</button>
            {rounds.map((r) => (
              <button key={r.id} className={'chip' + (r.id === roundId ? ' on' : '')} onClick={() => pickRound(r.id)}>Ronde {r.number}<small>terminée</small></button>
            ))}
          </div>
          {data.totals && data.totals.results ? <StatsBoard data={data} seasonMode={!roundId} /> : <div className="msg info">Pas de journée comptée pour cette sélection.</div>}
        </>
      )}
    </>
  );
}

function Page_({ ctx }) {
  const isAdmin = !!ctx.profile.is_admin;
  return (
    <main className="page">
      <div>
        <div className="eyebrow">Survivor Pool Hockey</div>
        <h1>Statistiques</h1>
      </div>
      {isAdmin ? (
        <div className="msg info">Aperçu de ce que voient les participants. Tes stats complètes sont dans Gestion → Statistiques.</div>
      ) : (
        <>
          <h2 className={s.h2}>Mes stats</h2>
          <MyStats />
          <p className="fine" style={{ margin: 0 }}>Tes chiffres incluent la ronde en cours et ne sont affichés qu’à toi, mais jamais le nom des joueurs que tu y as choisis. À toi de t’en souvenir pour éviter les doublons 😉</p>
        </>
      )}
      <h2 className={s.h2}>Le pool</h2>
      <Pool />
      <p className="fine" style={{ margin: 0 }}>Les stats du pool comptent seulement les rondes terminées de la saison, quand toutes les prédictions sont déjà publiques. Les participants retirés d’une ronde sont exclus.</p>
    </main>
  );
}

export default function Page() {
  return <AppShell>{(ctx) => <Page_ ctx={ctx} />}</AppShell>;
}
