'use client';
import { useEffect, useMemo, useState } from 'react';
import Lives from '@/components/Lives';
import { supabase, frError } from '@/lib/supabase';
import { todayLocal, fmtDate, fmtShort } from '@/lib/time';
import s from './history.module.css';

const OUT = { survie: 'Survit', sans_point: 'Sans point', doublon: 'Doublon', aucun_choix: 'Aucun choix' };
const short = (n) => {
  if (!n) return '?';
  if (/TARO TSUJIMOTO/.test(n)) return 'TARO';
  const parts = n.split(' ');
  return parts.length > 1 ? parts[0][0] + '. ' + parts.slice(1).join(' ') : n;
};
const nameOf = (e) => (e.profiles ? (e.profiles.nickname || e.profiles.first_name) : '?');
const statusLabel = (r) => (r.status === 'terminee' ? 'terminée' : r.status === 'en_cours' ? 'en cours' : 'inscriptions');

export default function History() {
  const [rounds, setRounds] = useState([]);
  const [roundId, setRoundId] = useState(null);
  const [data, setData] = useState(null);
  const [focus, setFocus] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    supabase.from('rounds').select('*').order('number', { ascending: false }).then(({ data: r }) => {
      setRounds(r || []);
      if (r && r[0]) setRoundId((r.find((x) => x.status !== 'inscriptions') || r[0]).id);
    });
  }, []);

  const round = rounds.find((r) => r.id === roundId);

  useEffect(() => {
    if (!round) return;
    setData(null); setFocus(null); setMsg(null);
    (async () => {
      try {
        const [e, d, p, res] = await Promise.all([
          supabase.from('round_entries').select('user_id, lives, paid, winner, finalist, profiles(first_name, last_name, nickname)').eq('round_id', round.id),
          supabase.from('game_days').select('game_date, first_game_at, closed_at').gte('game_date', round.start_date).order('game_date'),
          supabase.from('picks').select('user_id, game_date, player_id, is_default').eq('round_id', round.id),
          supabase.from('day_results').select('user_id, game_date, player_id, points, outcome, life_lost').eq('round_id', round.id),
        ]);
        for (const x of [e, d, p, res]) if (x.error) throw x.error;
        const ids = [...new Set([...(p.data || []), ...(res.data || [])].map((x) => x.player_id).filter(Boolean))];
        const names = {};
        for (let i = 0; i < ids.length; i += 200) {
          const { data: pl, error } = await supabase.from('players').select('id, full_name').in('id', ids.slice(i, i + 200));
          if (error) throw error;
          (pl || []).forEach((x) => { names[x.id] = x.full_name; });
        }
        const dates = [...(res.data || []), ...(p.data || [])].map((x) => x.game_date).sort();
        const end = round.status === 'terminee' ? (dates[dates.length - 1] || round.start_date) : todayLocal();
        const days = (d.data || []).filter((x) => x.game_date <= end);
        const entries = (e.data || []).sort((a, b) => (b.lives - a.lives) || nameOf(a).localeCompare(nameOf(b)));
        setData({ entries, days, picks: p.data || [], results: res.data || [], names });
      } catch (err) { setMsg({ t: 'err', m: frError(err) }); }
    })();
  }, [roundId]); // eslint-disable-line

  const idx = useMemo(() => {
    if (!data) return null;
    const pick = {}, result = {}, elim = {};
    data.picks.forEach((x) => { pick[x.user_id + '|' + x.game_date] = x; });
    data.results.forEach((x) => { result[x.user_id + '|' + x.game_date] = x; });
    data.entries.forEach((en) => {
      if (en.lives > 0) return;
      const lost = data.results.filter((x) => x.user_id === en.user_id && x.life_lost).map((x) => x.game_date).sort();
      elim[en.user_id] = lost[lost.length - 1] || null;
    });
    return { pick, result, elim };
  }, [data]);

  const now = Date.now();
  const isSecret = (day) => now < new Date(day.first_game_at).getTime() + 30 * 60000;

  function cell(en, day) {
    if (isSecret(day)) return <span className={s.secret} title="Secret jusqu’à 30 min après le premier match">🔒</span>;
    const key = en.user_id + '|' + day.game_date;
    const r = idx.result[key];
    const p = idx.pick[key];
    const out = idx.elim[en.user_id];
    if (r) {
      const n = data.names[r.player_id];
      return <span className={s.cell + ' ' + s[r.outcome]} title={`${n || ''} · ${OUT[r.outcome]}`}>{short(n)}<small>{r.outcome === 'survie' ? `+${r.points} pt` : OUT[r.outcome]}</small></span>;
    }
    if (p) return <span className={s.cell + ' ' + s.pending} title="Journée pas encore fermée">{short(data.names[p.player_id])}<small>en attente</small></span>;
    if (out && day.game_date > out) return <span className={s.out}>—</span>;
    return <span className={s.out}>·</span>;
  }

  function exportCsv() {
    const rows = [['Ronde', 'Participant', 'Nom complet', 'Date', 'Joueur', 'Points', 'Résultat']];
    data.entries.forEach((en) => {
      data.days.forEach((day) => {
        if (isSecret(day)) return;
        const key = en.user_id + '|' + day.game_date;
        const r = idx.result[key];
        const p = idx.pick[key];
        if (!r && !p) return;
        const pid = r ? r.player_id : p.player_id;
        rows.push([round.number, nameOf(en), `${en.profiles?.first_name || ''} ${en.profiles?.last_name || ''}`.trim(), day.game_date, data.names[pid] || '', r ? r.points : '', r ? OUT[r.outcome] : 'en attente']);
      });
    });
    const csv = '\uFEFF' + rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `ronde-${round.number}-predictions.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const winners = data ? data.entries.filter((e) => e.winner || e.user_id === round.winner_id) : [];
  const paid = data ? data.entries.filter((e) => e.paid).length : 0;
  const focused = focus && data && data.entries.find((e) => e.user_id === focus);

  return (
    <section className="panel stack">
      <h2>Historique des rondes</h2>
      <div className="chips">
        {rounds.map((r) => (
          <button key={r.id} className={'chip' + (r.id === roundId ? ' on' : '')} onClick={() => setRoundId(r.id)}>
            Ronde {r.number}<small>{statusLabel(r)}</small>
          </button>
        ))}
        {rounds.length === 0 && <div className="fine">Aucune ronde.</div>}
      </div>
      {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      {round && !data && !msg && <div className="fine">Chargement…</div>}

      {round && data && (
        <>
          <div className={s.summary}>
            <h2>Ronde {round.number} · {statusLabel(round)}</h2>
            <div className="fine">Début {fmtDate(round.start_date)} · {data.entries.length} participants · {data.days.length} journée(s) · cagnotte {paid * Number(round.fee)} $</div>
            {winners.length > 0 && <div><b>🏆 {winners.map(nameOf).join(' · ')}</b>{round.tie_status === 'partage' && <span className="fine"> (partage)</span>}</div>}
            {round.tie_status === 'prolongation' && round.status === 'en_cours' && <div className="fine">En prolongation depuis le {fmtDate(round.overtime_start)}</div>}
          </div>

          <div className={s.legend}>
            <span><i className={s.dot + ' ' + s.survie} />Survit</span>
            <span><i className={s.dot + ' ' + s.sans_point} />Sans point</span>
            <span><i className={s.dot + ' ' + s.doublon} />Doublon</span>
            <span><i className={s.dot + ' ' + s.aucun_choix} />Aucun choix (TARO)</span>
            <span><i className={s.dot + ' ' + s.pending} />Journée non fermée</span>
            <span>🔒 Encore secret</span>
          </div>

          {data.entries.length === 0 ? <div className="fine">Aucun participant dans cette ronde.</div> : (
            <div className={s.wrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.name}>Participant</th>
                    {data.days.map((d) => <th key={d.game_date}>{fmtShort(d.game_date)}</th>)}
                    <th>Vies</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((en) => (
                    <tr key={en.user_id}>
                      <td className={s.name}>
                        <button className={s.nameBtn + (focus === en.user_id ? ' ' + s.on : '')} onClick={() => setFocus(focus === en.user_id ? null : en.user_id)}>
                          {(en.winner || en.user_id === round.winner_id) && '🏆 '}{nameOf(en)}
                        </button>
                      </td>
                      {data.days.map((d) => <td key={d.game_date}>{cell(en, d)}</td>)}
                      <td className={s.end}>{en.lives > 0 ? <Lives n={en.lives} size={16} /> : (idx.elim[en.user_id] ? `Out ${fmtShort(idx.elim[en.user_id])}` : 'Out')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {focused && (
            <div className="panel stack" style={{ background: 'var(--soft)' }}>
              <h2>{nameOf(focused)} · {focused.profiles?.first_name} {focused.profiles?.last_name}</h2>
              <div className="list">
                {data.days.map((d) => {
                  const key = focused.user_id + '|' + d.game_date;
                  const r = idx.result[key];
                  const p = idx.pick[key];
                  if (isSecret(d)) return <div className="line" key={d.game_date}><span>{fmtDate(d.game_date)}</span><span className="fine">🔒 secret</span></div>;
                  if (!r && !p) return null;
                  const n = data.names[(r || p).player_id];
                  return (
                    <div className="line" key={d.game_date}>
                      <div><div className="t">{n}</div><div className="s">{fmtDate(d.game_date)}</div></div>
                      <span className={'badge ' + (!r ? 'wait' : r.outcome === 'survie' ? 'ok' : 'bad')}>{r ? `${OUT[r.outcome]}${r.outcome === 'survie' ? ` · ${r.points} pt` : ''}` : 'en attente'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="row">
            <p className="fine" style={{ margin: 0 }}>Touche le nom d’un participant pour voir le détail de ses prédictions. Les journées pas encore commencées restent secrètes, même pour le commissaire.</p>
            <button className="btn secondary small" style={{ flex: 'none' }} onClick={exportCsv}>Exporter (Excel)</button>
          </div>
        </>
      )}
    </section>
  );
}
