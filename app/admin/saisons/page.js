'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase, frError } from '@/lib/supabase';
import { fmtDate, fmtShort, fmtTime } from '@/lib/time';
import s from './saisons.module.css';

const OUT = {
  survie: ['Survit', 'ok'],
  sans_point: ['0 point', 'bad'],
  doublon: ['Doublon', 'bad'],
  aucun_choix: ['TARO', 'taro'],
};
const dateOf = (ts) => (ts ? String(ts).slice(0, 10) : null);

function csvCell(v) {
  const t = v === null || v === undefined ? '' : String(v);
  return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

function download(name, rows) {
  const text = '\ufeff' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function RoundGrid({ season, round }) {
  const [people, setPeople] = useState(null);
  const [cells, setCells] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    setPeople(null); setErr('');
    Promise.all([
      supabase.rpc('admin_round_people', { p_round: round.id }),
      supabase.rpc('admin_round_grid', { p_round: round.id }),
    ]).then(([a, b]) => {
      if (a.error || b.error) setErr(frError(a.error || b.error));
      setPeople(a.data || []);
      setCells(b.data || []);
    });
  }, [round.id]);

  if (err) return <div className="msg err">{err}</div>;
  if (!people) return <div className="fine">Chargement…</div>;

  const dates = [...new Set(cells.map((c) => c.game_date))].sort();
  const at = {};
  cells.forEach((c) => { at[c.user_id + '|' + c.game_date] = c; });
  const lostOn = (uid) => {
    const lost = cells.filter((c) => c.user_id === uid && c.life_lost).map((c) => c.game_date).sort();
    return lost.length >= 3 ? lost[lost.length - 1] : null;
  };
  const sorted = [...people].sort((a, b) => (b.winner - a.winner) || (b.lives - a.lives) || a.display_name.localeCompare(b.display_name, 'fr'));

  const exportCsv = () => {
    const head = ['Participant', ...dates, 'Vies restantes', 'Gagnant', 'Payé'];
    const rows = sorted.map((p) => [
      p.display_name,
      ...dates.map((d) => { const c = at[p.user_id + '|' + d]; return c ? `${c.player_name}${c.outcome ? ' (' + (OUT[c.outcome] ? OUT[c.outcome][0] : c.outcome) + ')' : ''}` : ''; }),
      p.lives, p.winner ? 'Oui' : '', p.paid ? 'Oui' : 'Non',
    ]);
    const safe = season.name.replace(/[^\w\-]+/g, '-');
    download(`${safe}-ronde-${round.number}.csv`, [head, ...rows]);
  };

  return (
    <div className="stack">
      {dates.length === 0 ? <div className="msg info">Aucune prédiction enregistrée pour cette ronde.</div> : (
        <div className={s.gridWrap}>
          <table className={s.grid}>
            <thead>
              <tr>
                <th className={s.sticky}>Participant</th>
                {dates.map((d) => <th key={d}>{fmtShort(d)}</th>)}
                <th>Vies</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const out = lostOn(p.user_id);
                return (
                  <tr key={p.user_id}>
                    <th className={s.sticky}>{p.winner && '🏆 '}{p.display_name}</th>
                    {dates.map((d) => {
                      const c = at[p.user_id + '|' + d];
                      if (!c) return <td key={d} className={s.none}>—</td>;
                      const o = OUT[c.outcome];
                      return (
                        <td key={d}>
                          <div className={s.cell + ' ' + (o ? s[o[1]] : s.wait)}>
                            <b>{c.player_name}</b>
                            <span>{o ? o[0] : 'en attente'}</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className={s.lives}>{p.lives > 0 ? `${p.lives} vie${p.lives > 1 ? 's' : ''}` : (out ? `Out ${fmtShort(out)}` : 'Out')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn secondary" onClick={exportCsv} disabled={!people.length}>Exporter (Excel)</button>
      </div>
    </div>
  );
}

function Archive({ season }) {
  const [rounds, setRounds] = useState(null);
  const [roundId, setRoundId] = useState(null);
  const [chat, setChat] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setRounds(null); setRoundId(null); setChat(null); setShowChat(false); setErr('');
    supabase.rpc('admin_season_rounds', { p_season: season.id }).then(({ data, error }) => {
      if (error) setErr(frError(error));
      setRounds(data || []);
      if (data && data.length) setRoundId(data[data.length - 1].id);
    });
    supabase.rpc('admin_season_chat', { p_season: season.id }).then(({ data }) => setChat(data || []));
  }, [season.id]);

  const round = (rounds || []).find((r) => r.id === roundId);

  return (
    <div className="stack">
      <div className={s.seasonHead}>
        <h2 style={{ margin: 0 }}>{season.name}</h2>
        <div className="fine">Du {fmtDate(dateOf(season.started_at))} au {season.ended_at ? fmtDate(dateOf(season.ended_at)) : '…'} · {season.nb_rounds} ronde{season.nb_rounds > 1 ? 's' : ''}</div>
      </div>
      {err && <div className="msg err">{err}</div>}
      {!rounds ? <div className="fine">Chargement…</div> : rounds.length === 0 ? <div className="msg info">Aucune ronde dans cette saison.</div> : (
        <>
          <div className={s.rounds}>
            {rounds.map((r) => (
              <button key={r.id} className={s.roundCard + (r.id === roundId ? ' ' + s.roundOn : '')} onClick={() => setRoundId(r.id)}>
                <span className={s.roundNum}>Ronde {r.number}</span>
                <span className={s.roundWin}>{r.winners ? '🏆 ' + r.winners : 'Aucun gagnant déclaré'}</span>
                <span className={s.roundMeta}>Début {fmtShort(r.start_date)} · {r.participants} participant{r.participants > 1 ? 's' : ''} · {Number(r.pot) || 0} $</span>
              </button>
            ))}
          </div>
          {round && <RoundGrid season={season} round={round} />}
        </>
      )}
      <div className={s.chatBox}>
        <button className="btn secondary" onClick={() => setShowChat((v) => !v)} disabled={!chat}>
          {showChat ? 'Masquer' : 'Voir'} le Vestiaire archivé{chat ? ` (${chat.length} message${chat.length > 1 ? 's' : ''})` : ''}
        </button>
        {showChat && chat && (
          chat.length === 0 ? <div className="fine">Aucun message dans cette saison.</div> : (
            <div className={s.chat}>
              {chat.map((m, i) => (
                <div key={i} className={s.msg}>
                  <div className={s.msgMeta}><b>{m.display_name}</b>{m.is_admin && <span className={s.staff}>Commissaire</span>}<span>{fmtShort(dateOf(m.created_at))} · {fmtTime(m.created_at)}</span></div>
                  <div className={s.msgBody}>{m.body}</div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Seasons() {
  const [seasons, setSeasons] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [newName, setNewName] = useState('');
  const [oldName, setOldName] = useState('');
  const [confirmTxt, setConfirmTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [archId, setArchId] = useState(null);

  async function load() {
    const { data, error } = await supabase.rpc('admin_seasons');
    if (error) { setErr(frError(error)); setSeasons([]); return; }
    setSeasons(data || []);
    const cur = (data || []).find((x) => x.is_current);
    if (cur) setOldName(cur.name);
    const arch = (data || []).filter((x) => !x.is_current);
    setArchId((v) => v ?? (arch[0] ? arch[0].id : null));
  }
  useEffect(() => { load(); }, []);

  const current = (seasons || []).find((x) => x.is_current);
  const archives = (seasons || []).filter((x) => !x.is_current);
  const blocked = current && current.nb_open > 0;
  const ready = !blocked && newName.trim().length > 0 && confirmTxt.trim().toUpperCase() === 'NOUVELLE SAISON';

  async function launch(e) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setErr(''); setOk('');
    const { error } = await supabase.rpc('start_new_season', { p_name: newName.trim(), p_confirm: confirmTxt.trim(), p_archive_name: oldName.trim() || null });
    setBusy(false);
    if (error) return setErr(frError(error));
    setOk(`La saison « ${newName.trim()} » est lancée. Prochaine ronde: ronde 1.`);
    setNewName(''); setConfirmTxt(''); setArchId(null);
    load();
  }

  if (!seasons) return <main className="page"><div className="loading">Chargement…</div></main>;

  return (
    <main className="page">
      <div>
        <div className="eyebrow">Bureau du commissaire</div>
        <h1>Saisons et archives</h1>
      </div>

      {err && <div className="msg err" role="alert">{err}</div>}
      {ok && <div className="msg ok" role="status">{ok}</div>}

      <section className="panel stack">
        <div className="eyebrow">Saison en cours</div>
        {current ? (
          <div>
            <h2 style={{ margin: '0 0 2px' }}>{current.name}</h2>
            <div className="fine">Depuis le {fmtDate(dateOf(current.started_at))} · {current.nb_rounds} ronde{current.nb_rounds > 1 ? 's' : ''}</div>
          </div>
        ) : <div className="msg warn">Aucune saison en cours.</div>}
      </section>

      <section className={'panel stack ' + s.danger}>
        <h2 style={{ margin: 0 }}>Lancer une nouvelle saison</h2>
        <p className="fine" style={{ margin: 0 }}>Les rondes, prédictions, résultats et conversations de la saison actuelle partent aux archives (visibles par toi seulement). Les comptes sont conservés, les rondes repartent à 1, le Vestiaire repart à neuf et chacun retrouve ses deux changements de surnom.</p>
        {blocked && <div className="msg warn">Impossible pour l’instant: une ronde est encore en cours ou ouverte aux inscriptions. Termine-la d’abord.</div>}
        <form className="stack" onSubmit={launch}>
          <label className={s.lbl}>Nom de la nouvelle saison
            <input className="field" maxLength={60} placeholder="ex. Saison 2026-2027" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={blocked} />
          </label>
          <label className={s.lbl}>Nom de la saison qui part aux archives
            <input className="field" maxLength={60} value={oldName} onChange={(e) => setOldName(e.target.value)} disabled={blocked} />
          </label>
          <label className={s.lbl}>Pour confirmer, écris <b>NOUVELLE SAISON</b>
            <input className="field" autoComplete="off" placeholder="NOUVELLE SAISON" value={confirmTxt} onChange={(e) => setConfirmTxt(e.target.value)} disabled={blocked} />
          </label>
          <button className={'btn ' + s.go} type="submit" disabled={!ready || busy}>{busy ? 'Lancement…' : 'Lancer la nouvelle saison'}</button>
        </form>
      </section>

      <section className="panel stack">
        <div className="eyebrow">Archives · Commissaire seulement</div>
        {archives.length === 0 ? <div className="msg info">Aucune archive pour l’instant. Elles apparaîtront ici après le lancement d’une nouvelle saison.</div> : (
          <>
            {archives.length > 1 && (
              <div className="chips">
                {archives.map((x) => <button key={x.id} className={'chip' + (x.id === archId ? ' on' : '')} onClick={() => setArchId(x.id)}>{x.name}<small>{x.nb_rounds} ronde{x.nb_rounds > 1 ? 's' : ''}</small></button>)}
              </div>
            )}
            {archives.find((x) => x.id === archId) && <Archive season={archives.find((x) => x.id === archId)} />}
          </>
        )}
      </section>
    </main>
  );
}

export default function Page() {
  return <AppShell requireAdmin><Seasons /></AppShell>;
}
