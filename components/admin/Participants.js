'use client';
import { useEffect, useState } from 'react';
import { supabase, frError } from '@/lib/supabase';
import { fmtDateTime } from '@/lib/time';

export default function Participants() {
  const [people, setPeople] = useState([]);
  const [entries, setEntries] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [msg, setMsg] = useState(null);

  async function load() {
    const [p, e, r] = await Promise.all([
      supabase.rpc('admin_participants'),
      supabase.from('round_entries').select('*'),
      supabase.from('rounds').select('*').order('number', { ascending: false }),
    ]);
    if (p.error) setMsg({ t: 'err', m: frError(p.error) });
    setPeople(p.data || []); setEntries(e.data || []); setRounds(r.data || []);
  }
  useEffect(() => { load(); }, []);

  async function togglePaid(en) {
    const { error } = await supabase.from('round_entries').update({ paid: !en.paid }).eq('round_id', en.round_id).eq('user_id', en.user_id);
    if (error) return setMsg({ t: 'err', m: frError(error) });
    load();
  }

  async function remove(en, who) {
    if (!confirm(`Retirer ${who} de cette ronde? Ses choix de la ronde seront supprimés.`)) return;
    const { error } = await supabase.rpc('admin_remove_entry', { p_round: en.round_id, p_user: en.user_id });
    if (error) return setMsg({ t: 'err', m: frError(error) });
    load();
  }

  const unpaid = entries.filter((e) => !e.paid).length;

  return (
    <section className="panel stack">
      <h2>Participants ({people.length})</h2>
      {unpaid > 0 && <div className="msg warn">{unpaid} paiement(s) en attente de confirmation.</div>}
      {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      <div className="list">
        {people.map((p) => {
          const mine = entries.filter((e) => e.user_id === p.id);
          const who = p.nickname || p.first_name;
          return (
            <div className="line" key={p.id} style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div className="t">{who} <span className="fine">· {p.first_name} {p.last_name}</span></div>
                  <div className="s">
                    <a href={`mailto:${p.email}`} title={`Écrire à ${who}`}>{p.email}</a>
                    {' '}· inscrit {fmtDateTime(p.created_at)} · règlements {p.rules_version || 'non acceptés'}
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 6, justifyContent: 'flex-start' }}>
                {mine.map((en) => {
                  const r = rounds.find((x) => x.id === en.round_id);
                  return (
                    <span key={en.round_id} className="row" style={{ flex: 'none', gap: 4 }}>
                      <button className={'btn small ' + (en.paid ? 'secondary' : '')} onClick={() => togglePaid(en)} title="Basculer le paiement">
                        R{r ? r.number : '?'} · {en.paid ? 'Payé ✓' : 'Confirmer paiement'} · {en.lives} vie(s)
                      </button>
                      <button className="btn ghost small" onClick={() => remove(en, who)} aria-label="Retirer">✕</button>
                    </span>
                  );
                })}
                {mine.length === 0 && <span className="fine">Aucune ronde</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
