'use client';
import { useEffect, useState } from 'react';
import { supabase, frError } from '@/lib/supabase';
import { fmtDate } from '@/lib/time';
import { ENTRY_FEE } from '@/lib/config';

export default function Rounds() {
  const [rounds, setRounds] = useState([]);
  const [counts, setCounts] = useState({});
  const [form, setForm] = useState({ number: '', start_date: '' });
  const [msg, setMsg] = useState(null);

  async function load() {
    const [{ data: r }, { data: e }] = await Promise.all([
      supabase.from('rounds').select('*').order('number', { ascending: false }),
      supabase.from('round_entries').select('round_id, lives, paid'),
    ]);
    setRounds(r || []);
    const c = {};
    (e || []).forEach((x) => { c[x.round_id] = c[x.round_id] || { n: 0, alive: 0, paid: 0 }; c[x.round_id].n++; if (x.lives > 0) c[x.round_id].alive++; if (x.paid) c[x.round_id].paid++; });
    setCounts(c);
    setForm((f) => ({ ...f, number: String(((r || [])[0]?.number || 0) + 1) }));
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    const { error } = await supabase.from('rounds').insert({ number: Number(form.number), start_date: form.start_date, fee: ENTRY_FEE });
    if (error) return setMsg({ t: 'err', m: frError(error) });
    setMsg({ t: 'ok', m: `Ronde ${form.number} créée. Les inscriptions sont ouvertes.` });
    load();
  }
  async function setStatus(r, status) {
    const { error } = await supabase.from('rounds').update({ status }).eq('id', r.id);
    if (error) return setMsg({ t: 'err', m: frError(error) });
    load();
  }

  return (
    <>
      <section className="panel stack">
        <h2>Nouvelle ronde</h2>
        <form className="row" onSubmit={create}>
          <label className="lbl">Numéro<input className="field" type="number" min="1" required value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></label>
          <label className="lbl">Date de début<input className="field" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
          <button className="btn" type="submit" style={{ alignSelf: 'flex-end' }}>Créer</button>
        </form>
        <p className="fine">Les rondes peuvent se chevaucher. Passe une ronde « En cours » quand elle démarre (ferme les inscriptions).</p>
        {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      </section>
      <section className="panel">
        <h2>Rondes</h2>
        <div className="list">
          {rounds.map((r) => {
            const c = counts[r.id] || { n: 0, alive: 0, paid: 0 };
            return (
              <div className="line" key={r.id}>
                <div>
                  <div className="t">Ronde {r.number}</div>
                  <div className="s">Début {fmtDate(r.start_date)} · {c.n} inscrits · {c.paid} payés · {c.alive} en vie · cagnotte {c.paid * Number(r.fee)} $</div>
                  {r.status === 'en_cours' && c.alive === 1 && <div className="msg ok" style={{ marginTop: 6 }}>Un seul survivant: tu peux terminer la ronde.</div>}
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
