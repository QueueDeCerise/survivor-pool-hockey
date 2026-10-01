'use client';
import { useEffect, useState } from 'react';
import { supabase, fetchAll, frError } from '@/lib/supabase';
import { fmtDateTime } from '@/lib/time';

export default function Players() {
  const [pending, setPending] = useState([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    const [{ data: p }, { count }] = await Promise.all([
      supabase.from('players').select('*, profiles:proposed_by(first_name, nickname)').eq('approved', false).order('created_at'),
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('approved', true).eq('is_default', false),
    ]);
    setPending(p || []); setTotal(count || 0);
  }
  useEffect(() => { load(); }, []);

  async function approve(p) {
    const { error } = await supabase.from('players').update({ approved: true }).eq('id', p.id);
    if (error) return setMsg({ t: 'err', m: frError(error) });
    setMsg({ t: 'ok', m: `${p.full_name} est maintenant sélectionnable.` });
    load();
  }
  async function reject(p) {
    if (!confirm(`Refuser et supprimer la proposition « ${p.full_name} »?`)) return;
    const { error } = await supabase.from('players').delete().eq('id', p.id);
    if (error) return setMsg({ t: 'err', m: frError(error) });
    load();
  }

  async function importNhl() {
    setBusy(true); setMsg({ t: 'info', m: 'Téléchargement des 32 alignements NHL…' });
    try {
      const res = await fetch('/api/nhl/players');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur NHL');
      const existing = await fetchAll(() => supabase.from('players').select('id, nhl_id, full_name').eq('is_default', false));
      const byNhl = new Set(existing.filter((p) => p.nhl_id).map((p) => p.nhl_id));
      const manual = new Map(existing.filter((p) => !p.nhl_id).map((p) => [p.full_name.toLowerCase(), p]));
      // relie les joueurs ajoutés manuellement à leur fiche NHL
      for (const p of json.players) {
        const m = manual.get(p.full_name.toLowerCase());
        if (m && !byNhl.has(p.nhl_id)) {
          await supabase.from('players').update({ nhl_id: p.nhl_id, position: p.position, approved: true }).eq('id', m.id);
          byNhl.add(p.nhl_id);
          manual.delete(p.full_name.toLowerCase());
        }
      }
      const rows = json.players.map((p) => ({ nhl_id: p.nhl_id, full_name: p.full_name, position: p.position, approved: true }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('players').upsert(rows.slice(i, i + 500), { onConflict: 'nhl_id' });
        if (error) throw error;
      }
      setMsg({ t: 'ok', m: `${rows.length} joueurs NHL à jour.${json.failed.length ? ' Équipes non chargées: ' + json.failed.join(', ') : ''}` });
      load();
    } catch (e) { setMsg({ t: 'err', m: frError(e) }); } finally { setBusy(false); }
  }

  return (
    <>
      <section className="panel stack">
        <h2>Liste des joueurs</h2>
        <div className="row"><div className="fine">{total} joueurs sélectionnables.</div><button className="btn" disabled={busy} onClick={importNhl}>{busy ? 'Import…' : 'Mettre à jour depuis la NHL'}</button></div>
        <p className="fine">Relance cet import après les échanges et rappels. Tous les joueurs restent visibles, y compris blessés et suspendus.</p>
        {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      </section>
      <section className="panel">
        <h2>Joueurs proposés · {pending.length} en attente</h2>
        <div className="list">
          {pending.map((p) => (
            <div className="line" key={p.id}>
              <div>
                <div className="t">{p.full_name} <span className="badge">{p.position}</span></div>
                <div className="s">Proposé par {p.profiles ? (p.profiles.nickname || p.profiles.first_name) : '?'} · {fmtDateTime(p.created_at)}</div>
              </div>
              <div className="row" style={{ flex: 'none', gap: 6 }}>
                <button className="btn secondary small" onClick={() => reject(p)}>Refuser</button>
                <button className="btn small" onClick={() => approve(p)}>Valider</button>
              </div>
            </div>
          ))}
          {pending.length === 0 && <div className="fine">La file est vide.</div>}
        </div>
      </section>
    </>
  );
}
