'use client';
import { useEffect, useState } from 'react';
import { supabase, frError } from '@/lib/supabase';
import { fmtDate, fmtDateTime } from '@/lib/time';
import { ENTRY_FEE } from '@/lib/config';

const nameOf = (e) => (e && e.profiles ? (e.profiles.nickname || e.profiles.first_name) : '?');

export default function Rounds() {
  const [rounds, setRounds] = useState([]);
  const [entries, setEntries] = useState([]);
  const [closes, setCloses] = useState({});
  const [pick, setPick] = useState({});
  const [form, setForm] = useState({ number: '', start_date: '' });
  const [msg, setMsg] = useState(null);

  async function load() {
    const [{ data: r }, { data: e }] = await Promise.all([
      supabase.from('rounds').select('*').order('number', { ascending: false }),
      supabase.from('round_entries').select('round_id, user_id, lives, paid, profiles(first_name, nickname)'),
    ]);
    setRounds(r || []);
    setEntries(e || []);
    setForm((f) => ({ ...f, number: String(((r || [])[0]?.number || 0) + 1) }));
    const cl = {};
    await Promise.all((r || []).map(async (x) => {
      const { data } = await supabase.rpc('round_registration_closes_at', { p_round: x.id });
      cl[x.id] = data || null;
    }));
    setCloses(cl);
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    const { error } = await supabase.from('rounds').insert({ number: Number(form.number), start_date: form.start_date, fee: ENTRY_FEE });
    if (error) return setMsg({ t: 'err', m: frError(error) });
    setMsg({ t: 'ok', m: `Ronde ${form.number} créée. Les inscriptions sont ouvertes jusqu’au premier match.` });
    load();
  }
  async function setStatus(r, status) {
    const patch = { status };
    if (status !== 'terminee') { patch.winner_id = null; patch.finished_at = null; }
    const { error } = await supabase.from('rounds').update(patch).eq('id', r.id);
    if (error) return setMsg({ t: 'err', m: frError(error) });
    load();
  }
  async function declare(r) {
    const uid = pick[r.id];
    if (!uid) return;
    const who = nameOf(entries.find((e) => e.round_id === r.id && e.user_id === uid));
    if (!confirm(`Déclarer ${who} gagnant de la ronde ${r.number}? La ronde sera terminée.`)) return;
    const { error } = await supabase.from('rounds').update({ winner_id: uid, status: 'terminee', finished_at: new Date().toISOString() }).eq('id', r.id);
    if (error) return setMsg({ t: 'err', m: frError(error) });
    setMsg({ t: 'ok', m: `${who} est le champion de la ronde ${r.number}! 🏆` });
    load();
  }

  const now = Date.now();

  return (
    <>
      <section className="panel stack">
        <h2>Nouvelle ronde</h2>
        <form className="row" onSubmit={create}>
          <label className="lbl">Numéro<input className="field" type="number" min="1" required value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></label>
          <label className="lbl">Date de début<input className="field" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
          <button className="btn" type="submit" style={{ alignSelf: 'flex-end' }}>Créer</button>
        </form>
        <p className="fine">Les rondes peuvent se chevaucher. Au début du premier match, la ronde passe « En cours » automatiquement. Quand il ne reste qu’un survivant, elle se termine et son gagnant est affiché.</p>
        {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      </section>
      <section className="panel">
        <h2>Rondes</h2>
        <div className="list">
          {rounds.map((r) => {
            const mine = entries.filter((e) => e.round_id === r.id);
            const paid = mine.filter((e) => e.paid).length;
            const alive = mine.filter((e) => e.lives > 0);
            const close = closes[r.id];
            const closed = close && now >= new Date(close).getTime();
            const winner = r.winner_id && mine.find((e) => e.user_id === r.winner_id);
            const candidates = alive.length ? alive : mine;
            return (
              <div className="line" key={r.id} style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div className="t">Ronde {r.number}{winner && <> · 🏆 {nameOf(winner)}</>}</div>
                  <div className="s">Début {fmtDate(r.start_date)} · {mine.length} inscrits · {paid} payés · {alive.length} en vie · cagnotte {paid * Number(r.fee)} $</div>
                  <div className="s">
                    {!close ? 'Importe l’horaire pour fixer la fermeture des inscriptions.'
                      : closed ? `Inscriptions fermées depuis ${fmtDateTime(close)}`
                      : `Inscriptions jusqu’au ${fmtDateTime(close)}`}
                  </div>
                  {closed && r.status === 'inscriptions' && <div className="msg info" style={{ marginTop: 6 }}>Passage automatique à « En cours » dans la prochaine minute.</div>}
                  {r.status === 'en_cours' && alive.length === 0 && mine.length > 0 && (
                    <div className="msg warn" style={{ marginTop: 6 }}>Aucun survivant: tous ont perdu leur dernière vie. Choisis le gagnant selon ta décision.</div>
                  )}
                  {r.status === 'en_cours' && mine.length > 0 && (
                    <div className="row" style={{ marginTop: 8, gap: 6 }}>
                      <select className="field" value={pick[r.id] || ''} onChange={(e) => setPick({ ...pick, [r.id]: e.target.value })}>
                        <option value="">Déclarer un gagnant…</option>
                        {candidates.map((e) => <option key={e.user_id} value={e.user_id}>{nameOf(e)} · {e.lives} vie(s)</option>)}
                      </select>
                      <button className="btn small" style={{ flex: 'none' }} disabled={!pick[r.id]} onClick={() => declare(r)}>Déclarer</button>
                    </div>
                  )}
                </div>
                <select className="field" style={{ width: 150, flex: 'none' }} value={r.status} onChange={(e) => setStatus(r, e.target.value)}>
                  <option value="inscriptions">Inscriptions</option>
                  <option value="en_cours">En cours</option>
                  <option value="terminee">Terminée</option>
                </select>
              </div>
            );
          })}
          {rounds.length === 0 && <div className="fine">Aucune ronde.</div>}
        </div>
      </section>
    </>
  );
}
