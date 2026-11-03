'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase, frError } from '@/lib/supabase';
import { fmtDate } from '@/lib/time';
import s from './stats.module.css';

const OUTCOME = { sans_point: '0 point', aucun_choix: 'TARO', doublon: 'DOUBLON', survie: 'Survie' };
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
const pctTxt = (v) => (v === null ? '—' : v + ' %');
const money = (n) => {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')) + ' $';
};
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const Who = ({ name, left }) => <>{name}{left && <span className={s.muted}> (a quitté le pool)</span>}</>;

function Record({ emoji, title, sub, items, empty }) {
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <span className={s.emoji} aria-hidden="true">{emoji}</span>
        <div>
          <div className={s.cardTitle}>{title}</div>
          {sub && <div className={s.cardSub}>{sub}</div>}
        </div>
      </div>
      {items.length === 0 ? <div className={s.muted}>{empty || 'Rien à signaler pour l’instant.'}</div> : (
        <ol className={s.list}>
          {items.map((it, i) => (
            <li key={i} className={i === 0 ? s.top : ''}>
              <div className={s.main}>{it.main}</div>
              <div className={s.detail}>{it.detail}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const COLS = [
  ['name', 'Participant'], ['rounds', 'Rondes'], ['wins', 'Victoires'], ['gains', 'Gains'], ['days', 'Jours'],
  ['rate', 'Réussite'], ['best_streak', 'Meilleure série'], ['lives_lost', 'Vies perdues'], ['sans_point', '0 point'],
  ['taro', 'TARO'], ['doublon', 'Doublon'], ['points', 'Points'], ['patinapu', 'PATINAPU'],
];

function csvCell(v) {
  const t = v === null || v === undefined ? '' : String(v);
  return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

function Stats() {
  const [seasonId, setSeasonId] = useState(null);
  const [roundId, setRoundId] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState({ key: 'wins', dir: -1 });

  useEffect(() => {
    setErr('');
    supabase.rpc('admin_stats', { p_season: seasonId, p_round: roundId }).then(({ data: d, error }) => {
      if (error) { setErr(frError(error)); setData({ empty: true }); return; }
      setData(d);
    });
  }, [seasonId, roundId]);

  const rows = useMemo(() => {
    const list = ((data && data.participants) || []).map((p) => ({ ...p, rate: pct(p.survie, p.picks) }));
    const { key, dir } = sort;
    return list.sort((a, b) => {
      const x = a[key], y = b[key];
      if (key === 'name') return dir * String(x).localeCompare(String(y), 'fr');
      const nx = x === null ? -1 : Number(x), ny = y === null ? -1 : Number(y);
      if (nx !== ny) return dir * (nx - ny);
      return (b.wins - a.wins) || ((b.rate ?? -1) - (a.rate ?? -1)) || (b.best_streak - a.best_streak) || String(a.name).localeCompare(String(b.name), 'fr');
    });
  }, [data, sort]);

  if (!data) return <main className="page"><Header /><div className="fine">Chargement…</div></main>;

  const seasons = data.seasons || [];
  const rounds = data.rounds || [];
  const curSeason = seasons.find((x) => x.id === data.season_id);
  const round = roundId ? rounds.find((r) => r.id === roundId) : null;
  const t = data.totals || {};
  const seasonMode = !roundId;
  const R = (n) => (seasonMode ? `Ronde ${n} · ` : '');
  const activeRound = round ? round.status === 'en_cours' : rounds.some((r) => r.status === 'en_cours');

  const pickSeason = (id) => { if (id === data.season_id && !roundId) return; setData(null); setRoundId(null); setSeasonId(id); };
  const pickRound = (id) => { if (id === roundId) return; setData(null); setRoundId(id); };
  const sortBy = (key) => setSort((cur) => ({ key, dir: cur.key === key ? -cur.dir : key === 'name' ? 1 : -1 }));

  // Records
  const fastest = (data.fastest || []).map((f) => ({
    main: <Who name={f.name} left={f.left_pool} />,
    detail: `${R(f.ronde)}PATINAPU après ${plural(f.days, 'journée', 'journées')} · ${fmtDate(f.jour)}`,
  }));
  const firstBlood = (data.first_blood || []).map((f) => ({
    main: (f.victims || []).map((v, i) => <span key={i}>{i > 0 && ', '}<Who name={v.name} left={v.left_pool} /> <span className={s.tag}>{OUTCOME[v.outcome] || v.outcome}</span></span>),
    detail: `${R(f.ronde)}${f.day_no === 1 ? '1re journée' : f.day_no + 'e journée'} · ${fmtDate(f.jour)}`,
  }));
  const streaks = (data.streaks || []).map((x) => ({
    main: <><Who name={x.name} left={x.left_pool} />{x.ongoing && <span className={s.live}> en cours</span>}</>,
    detail: `${R(x.ronde)}${plural(x.len, 'journée', 'journées')} de suite · ${fmtDate(x.d1)} au ${fmtDate(x.d2)}`,
  }));
  const grenades = (data.grenades || []).map((g) => ({
    main: <><Who name={g.name} left={g.left_pool} /> · {g.player || 'joueur inconnu'}</>,
    detail: `${R(g.ronde)}${g.points} points · ${fmtDate(g.jour)}`,
  }));
  const taro = [...(data.participants || [])].filter((p) => p.taro > 0).sort((a, b) => b.taro - a.taro || a.name.localeCompare(b.name, 'fr')).slice(0, 5).map((p) => ({
    main: <Who name={p.name} left={p.left_pool} />,
    detail: `${plural(p.taro, 'prédiction oubliée', 'prédictions oubliées')}`,
  }));
  const massacres = (data.massacres || []).map((m) => {
    const parts = [m.sans_point && `${m.sans_point} × 0 point`, m.taro && `${m.taro} × TARO`, m.doublon && `${m.doublon} × DOUBLON`].filter(Boolean).join(', ');
    return { main: `${fmtDate(m.jour)}`, detail: `${R(m.ronde)}${plural(m.lost, 'vie perdue', 'vies perdues')} sur ${plural(m.alive, 'participant', 'participants')}${parts ? ' (' + parts + ')' : ''}` };
  });

  // Rondes (mode saison)
  const done = rounds.filter((r) => r.status === 'terminee' && r.days > 0);
  const longest = [...done].sort((a, b) => b.days - a.days || a.number - b.number)[0];
  const shortest = [...done].sort((a, b) => a.days - b.days || a.number - b.number)[0];
  const richest = [...rounds].filter((r) => Number(r.pot) > 0).sort((a, b) => Number(b.pot) - Number(a.pot) || a.number - b.number)[0];
  const roundItems = [
    longest && { main: `Plus longue : Ronde ${longest.number}`, detail: `${plural(longest.days, 'journée', 'journées')} · gagnant${longest.winners.length > 1 ? 's' : ''} : ${longest.winners.join(', ') || '—'}` },
    shortest && shortest !== longest && { main: `Plus courte : Ronde ${shortest.number}`, detail: `${plural(shortest.days, 'journée', 'journées')} · gagnant${shortest.winners.length > 1 ? 's' : ''} : ${shortest.winners.join(', ') || '—'}` },
    richest && { main: `Plus grosse cagnotte : Ronde ${richest.number}`, detail: `${money(richest.pot)} · ${plural(richest.nb, 'inscrit', 'inscrits')}` },
  ].filter(Boolean);

  // Joueurs LNH
  const players = (data.players || []).map((p) => ({ ...p, rate: pct(p.survie, p.picks) }));
  const minPicks = seasonMode ? 3 : 2;
  const popular = [...players].sort((a, b) => b.picks - a.picks || b.survie - a.survie || a.name.localeCompare(b.name, 'fr')).slice(0, 5).map((p) => ({
    main: p.name, detail: `${plural(p.picks, 'fois', 'fois')} · ${plural(p.pickers, 'participant', 'participants')} · ${p.survie} survie${p.survie > 1 ? 's' : ''}`,
  }));
  const safe = [...players].filter((p) => p.picks >= minPicks).sort((a, b) => b.rate - a.rate || b.picks - a.picks || a.name.localeCompare(b.name, 'fr')).slice(0, 5).map((p) => ({
    main: p.name, detail: `${p.rate} % · ${p.survie} sur ${p.picks} · ${plural(p.points, 'point', 'points')}`,
  }));
  const noBlade = [...players].filter((p) => p.zero > 0).sort((a, b) => b.zero - a.zero || a.rate - b.rate || a.name.localeCompare(b.name, 'fr')).slice(0, 5).map((p) => ({
    main: p.name, detail: `0 point ${plural(p.zero, 'fois', 'fois')} sur ${p.picks}`,
  }));

  const cols = COLS.filter(([k]) => !(k === 'rounds' && !seasonMode));
  const cell = (r, k) => {
    if (k === 'name') return <Who name={r.name} left={r.left_pool} />;
    if (k === 'gains') return Number(r.gains) > 0 ? money(r.gains) : '—';
    if (k === 'rate') return pctTxt(r.rate);
    return r[k];
  };
  const exportCsv = () => {
    const head = cols.map(([, l]) => l);
    const body = rows.map((r) => cols.map(([k]) => (k === 'name' ? r.name + (r.left_pool ? ' (a quitté le pool)' : '') : k === 'rate' ? (r.rate === null ? '' : r.rate + ' %') : k === 'gains' ? String(Number(r.gains)).replace('.', ',') : r[k])));
    const text = '\ufeff' + [head, ...body].map((r) => r.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `statistiques-${(curSeason ? curSeason.name : 'saison').replace(/\s+/g, '-').toLowerCase()}${round ? '-ronde-' + round.number : ''}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const nothing = !t.results;

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

      {nothing ? <div className="msg info">Pas encore de journée fermée pour cette sélection.</div> : (
        <>
          {activeRound && (
            <div className="msg info">Ronde en cours : ces stats montrent des choix encore cachés aux participants. Garde-les pour toi jusqu’à la fin de la ronde.</div>
          )}

          <div className={s.kpis}>
            <div className={s.kpi}><b>{t.days}</b><span>{t.days > 1 ? 'journées jouées' : 'journée jouée'}</span></div>
            <div className={s.kpi}><b>{t.picks}</b><span>prédictions faites</span></div>
            <div className={s.kpi}><b>{pctTxt(pct(t.survie, t.picks))}</b><span>taux de réussite</span></div>
            <div className={s.kpi}><b>{t.lives_lost}</b><span>vies perdues · {t.sans_point} × 0 pt, {t.taro} × TARO, {t.doublon} × DOUBLON</span></div>
          </div>

          <h2 className={s.h2}>Records</h2>
          <div className={s.grid}>
            <Record emoji="💀" title="Mort la plus rapide" sub="PATINAPU en un temps record" items={fastest} empty="Personne n’est encore PATINAPU." />
            <Record emoji="🩸" title="Premier sang" sub="La première vie perdue de la ronde" items={firstBlood} empty="Aucune vie perdue pour l’instant." />
            <Record emoji="🔥" title="Plus longue série" sub="Journées de suite sans perdre de vie" items={streaks} />
            <Record emoji="💣" title="Tuer une mouche avec une grenade" sub="Un seul point suffisait…" items={grenades} empty="Aucun choix à 2 points ou plus." />
            <Record emoji="😴" title="Roi du TARO" sub="Le champion des oublis" items={taro} empty="Aucun oubli : bravo la gang!" />
            <Record emoji="⚔️" title="Journée massacre" sub="Le plus de vies perdues le même soir" items={massacres} empty="Aucune vie perdue pour l’instant." />
            {seasonMode && roundItems.length > 0 && <Record emoji="⏱️" title="Les rondes" sub="Durée et cagnotte" items={roundItems} />}
          </div>

          <h2 className={s.h2}>Palmarès des participants</h2>
          <div className={s.wrap}>
            <table className={s.t}>
              <thead>
                <tr>
                  {cols.map(([k, l]) => (
                    <th key={k} className={k === 'name' ? s.sticky : ''}>
                      <button type="button" className={s.sortBtn} onClick={() => sortBy(k)} aria-sort={sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                        {l}{sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id}>
                    {cols.map(([k]) => <td key={k} className={k === 'name' ? s.sticky : s.num}>{cell(r, k)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={s.actions}>
            <button className="btn secondary small" onClick={exportCsv} disabled={!rows.length}>Exporter (Excel)</button>
            <span className="fine">Clique sur un titre de colonne pour trier. Réussite = journées survécues ÷ prédictions faites.</span>
          </div>

          <h2 className={s.h2}>Joueurs LNH</h2>
          <div className={s.grid}>
            <Record emoji="🎯" title="Les plus populaires" sub="Les joueurs les plus choisis" items={popular} />
            <Record emoji="🛡️" title="Valeurs sûres" sub={`Meilleur taux de réussite (choisis ${minPicks} fois et plus)`} items={safe} empty={`Aucun joueur choisi ${minPicks} fois encore.`} />
            <Record emoji="🏒" title="Jouer avec un bâton sans palette" sub="Choisi souvent, 0 point aussi souvent…" items={noBlade} empty="Aucun 0 point : tous les bâtons ont une palette!" />
          </div>

          <p className="fine" style={{ margin: 0 }}>Seules les journées fermées sont comptées. Les participants retirés d’une ronde sont exclus. TARO et doublons ne comptent pas dans les stats des joueurs LNH.</p>
        </>
      )}
    </main>
  );
}

function Header() {
  return (
    <div>
      <div className="eyebrow">Bureau du commissaire</div>
      <h1>Statistiques</h1>
    </div>
  );
}

export default function Page() {
  return <AppShell requireAdmin><Stats /></AppShell>;
}
