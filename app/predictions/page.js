'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase, fetchAll, frError } from '@/lib/supabase';
import { ENTRY_FEE, INTERAC_EMAIL, MESSENGER_URL } from '@/lib/config';
import { todayLocal, addDays, fmtDate, fmtShort, fmtTime, lateLimit } from '@/lib/time';

function Lives({ n }) {
  return <span className="lives" aria-label={`${n} vie(s)`}>{[0, 1, 2].map((i) => <i key={i} className={'life' + (i >= n ? ' off' : '')} />)}</span>;
}

function Predictions({ ctx }) {
  const uid = ctx.user.id;
  const [loading, setLoading] = useState(true);
  const [rounds, setRounds] = useState([]);
  const [entries, setEntries] = useState([]);
  const [days, setDays] = useState([]);
  const [players, setPlayers] = useState([]);
  const [picks, setPicks] = useState([]);
  const [scorers, setScorers] = useState(new Set());
  const [roundId, setRoundId] = useState(null);
  const [date, setDate] = useState(null);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(null);
  const [msg, setMsg] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [proposal, setProposal] = useState(null);

  async function loadAll() {
    const today = todayLocal();
    const [r, e, d, p, k] = await Promise.all([
      supabase.from('rounds').select('*').order('number'),
      supabase.from('round_entries').select('*').eq('user_id', uid),
      supabase.from('game_days').select('*').gte('game_date', today).lte('game_date', addDays(today, 21)).order('game_date'),
      fetchAll(() => supabase.from('players').select('id, full_name, position, approved, is_default, proposed_by').eq('is_default', false).order('full_name')),
      supabase.from('picks').select('*').eq('user_id', uid),
    ]);
    setRounds(r.data || []);
    setEntries(e.data || []);
    setDays(d.data || []);
    setPlayers(p || []);
    setPicks(k.data || []);
    const active = (e.data || []).filter((x) => (r.data || []).find((y) => y.id === x.round_id && y.status !== 'terminee'));
    setRoundId((cur) => cur ?? (active[0] && active[0].round_id) ?? null);
    setDate((cur) => cur ?? ((d.data || [])[0] && d.data[0].game_date) ?? null);
    setLoading(false);
  }

  useEffect(() => { loadAll(); const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []); // eslint-disable-line

  const day = days.find((d) => d.game_date === date);
  const started = day && now >= new Date(day.first_game_at).getTime();
  const lateEnd = day && lateLimit(day.first_game_at);
  const closed = day && now >= new Date(lateEnd).getTime();

  useEffect(() => {
    setChosen(null); setMsg(null);
    if (!date || !started) { setScorers(new Set()); return; }
    supabase.from('point_events').select('player_id, goals, assists').eq('game_date', date).then(({ data }) => {
      setScorers(new Set((data || []).filter((x) => x.goals + x.assists > 0).map((x) => x.player_id)));
    });
  }, [date, roundId, started]);

  const round = rounds.find((r) => r.id === roundId);
  const entry = entries.find((e) => e.round_id === roundId);
  const myActive = entries.filter((e) => rounds.find((r) => r.id === e.round_id && r.status !== 'terminee'));
  const openRounds = rounds.filter((r) => r.status === 'inscriptions' && !entries.find((e) => e.round_id === r.id));
  const roundDays = days.filter((d) => round && d.game_date >= round.start_date);
  const current = picks.find((p) => p.round_id === roundId && p.game_date === date);
  const currentPlayer = current && players.find((p) => p.id === current.player_id);
  const canChange = day && entry && entry.lives > 0 && (current ? !started : !closed);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => p.approved || p.proposed_by === uid)
      .filter((p) => !q || p.full_name.toLowerCase().includes(q))
      .slice(0, q ? 80 : 40);
  }, [players, query, uid]);

  async function join(r) {
    const { error } = await supabase.from('round_entries').insert({ round_id: r.id, user_id: uid });
    if (error) return setMsg({ t: 'err', m: frError(error) });
    setRoundId(r.id);
    await loadAll();
    setMsg({ t: 'ok', m: `Inscrit à la ronde ${r.number}. Envoie ${ENTRY_FEE} $ par Interac à ${INTERAC_EMAIL}.` });
  }

  async function save() {
    if (!chosen) return;
    setMsg(null);
    const res = current
      ? await supabase.from('picks').update({ player_id: chosen.id }).eq('id', current.id).select().single()
      : await supabase.from('picks').insert({ round_id: roundId, user_id: uid, game_date: date, player_id: chosen.id }).select().single();
    if (res.error) return setMsg({ t: 'err', m: frError(res.error) });
    setPicks((ps) => [...ps.filter((p) => p.id !== res.data.id), res.data]);
    setChosen(null);
    setMsg({ t: 'ok', m: `Choix enregistré en privé: ${chosen.full_name}.` });
  }

  async function propose(e) {
    e.preventDefault();
    const { error } = await supabase.from('players').insert({ full_name: proposal.name, position: proposal.pos, approved: false });
    if (error) return setMsg({ t: 'err', m: frError(error) });
    setProposal(null);
    setMsg({ t: 'ok', m: 'Joueur proposé. Il sera sélectionnable après validation du gestionnaire.' });
    loadAll();
  }

  if (loading) return <div className="loading">Chargement…</div>;

  return (
    <main className="page">
      {msg && <div className={'msg ' + msg.t} role="status">{msg.m}</div>}

      {openRounds.length > 0 && (
        <section className="panel">
          <h2>Inscriptions ouvertes</h2>
          <div className="list">
            {openRounds.map((r) => (
              <div className="line" key={r.id}>
                <div><div className="t">Ronde {r.number}</div><div className="s">Début {fmtDate(r.start_date)} · {Number(r.fee)} $</div></div>
                <button className="btn small" onClick={() => join(r)}>M’inscrire</button>
              </div>
            ))}
          </div>
          <p className="fine">Paiement par virement Interac à {INTERAC_EMAIL}. Le gestionnaire confirme la réception.</p>
        </section>
      )}

      {myActive.length === 0 ? (
        <section className="panel">
          <h2>Aucune ronde active</h2>
          <p className="fine">{openRounds.length ? 'Inscris-toi à une ronde ci-dessus pour faire tes choix.' : 'Le gestionnaire n’a pas encore ouvert de ronde.'}</p>
        </section>
      ) : (
        <>
          {myActive.length > 1 && (
            <div className="chips">
              {myActive.map((e) => {
                const r = rounds.find((x) => x.id === e.round_id);
                return <button key={e.round_id} className={'chip' + (e.round_id === roundId ? ' on' : '')} onClick={() => setRoundId(e.round_id)}>Ronde {r.number}<small>début {fmtShort(r.start_date)}</small></button>;
              })}
            </div>
          )}

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="eyebrow">Ronde {round && round.number} · début {round && fmtDate(round.start_date)}</div>
              <h1>{date ? fmtDate(date) : 'Aucun match'}</h1>
            </div>
            {entry && <div style={{ flex: 'none' }}><Lives n={entry.lives} /></div>}
          </div>

          {entry && !entry.paid && <div className="msg warn">Paiement de {ENTRY_FEE} $ en attente de confirmation (Interac à {INTERAC_EMAIL}).</div>}
          {entry && entry.lives <= 0 && <div className="msg err">Tu es éliminé de cette ronde.</div>}

          {roundDays.length === 0 ? (
            <div className="msg info">L’horaire des prochains matchs n’est pas encore publié.</div>
          ) : (
            <div className="chips">
              {roundDays.map((d) => (
                <button key={d.game_date} className={'chip' + (d.game_date === date ? ' on' : '') + (picks.find((p) => p.round_id === roundId && p.game_date === d.game_date) ? ' has' : '')} onClick={() => setDate(d.game_date)}>
                  {fmtShort(d.game_date)}<small>{fmtTime(d.first_game_at)}</small>
                </button>
              ))}
            </div>
          )}

          {day && (
            <section className="panel stack">
              <div className="msg warn">
                <b>Heure limite: {fmtTime(day.first_game_at)}</b> (début du premier match) pour faire ou modifier ton choix.
                {' '}Sans choix, dernière chance jusqu’à {fmtTime(lateEnd)}, sauf les joueurs qui ont déjà un point.
              </div>
              <div className={'msg ' + (current ? 'ok' : 'info')}>
                {current ? <>Ton choix privé: <b>{currentPlayer ? currentPlayer.full_name : '…'}</b></> : 'Aucun choix pour cette journée.'}
              </div>
              {Array.isArray(day.games) && day.games.length > 0 && (
                <div className="games">
                  <div className="eyebrow">Matchs du jour</div>
                  {day.games.map((g, i) => <div key={i}><b>{g.away} @ {g.home}</b><span className="mono">{fmtTime(g.start)}</span></div>)}
                </div>
              )}
            </section>
          )}

          {day && canChange && (
            <section className="panel stack">
              <h2>{current ? 'Changer mon choix' : 'Choisir un joueur'}</h2>
              <input className="field" placeholder="Rechercher un joueur…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="players">
                {list.map((p) => {
                  const pending = !p.approved;
                  const scored = started && scorers.has(p.id);
                  return (
                    <button key={p.id} className={'player' + (chosen && chosen.id === p.id ? ' sel' : '')} disabled={pending || scored} onClick={() => setChosen(p)}>
                      <span>{p.full_name} {pending && <span className="badge wait">EN ATTENTE</span>}</span>
                      <span className="badge">{p.position || ''}</span>
                    </button>
                  );
                })}
                {list.length === 0 && <div className="fine" style={{ padding: 12 }}>Aucun joueur trouvé.</div>}
              </div>
              {!query && <div className="fine">Tape un nom pour chercher parmi tous les joueurs.</div>}
              {proposal ? (
                <form className="stack" onSubmit={propose}>
                  <input className="field" required placeholder="Nom complet, ex. Zach Hyman" value={proposal.name} onChange={(e) => setProposal({ ...proposal, name: e.target.value })} />
                  <select className="field" value={proposal.pos} onChange={(e) => setProposal({ ...proposal, pos: e.target.value })}>
                    <option value="C">Centre</option><option value="AG">Ailier gauche</option><option value="AD">Ailier droit</option><option value="D">Défenseur</option><option value="G">Gardien</option>
                  </select>
                  <div className="row"><button type="button" className="btn secondary" onClick={() => setProposal(null)}>Annuler</button><button className="btn" type="submit">Proposer</button></div>
                </form>
              ) : (
                <button className="btn secondary" onClick={() => setProposal({ name: query, pos: 'C' })}>Joueur absent? Le proposer</button>
              )}
              {chosen && (
                <div className="sticky-cta"><button className="btn" onClick={save}>Confirmer {chosen.full_name}</button></div>
              )}
            </section>
          )}

          {current && (
            <p className="fine">Ton choix est enregistré en privé dans l’application. Tu peux aussi <a href={MESSENGER_URL} target="_blank" rel="noreferrer">l’envoyer au gestionnaire par Messenger</a>.</p>
          )}
        </>
      )}
    </main>
  );
}

export default function Page() {
  return <AppShell>{(ctx) => <Predictions ctx={ctx} />}</AppShell>;
}
