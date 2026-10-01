'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtDateTime } from '@/lib/time';

const LABELS = { profiles: 'Profil', rounds: 'Ronde', round_entries: 'Inscription', players: 'Joueur', point_events: 'Points', picks: 'Choix' };
const ACTIONS = { INSERT: 'ajout', UPDATE: 'modification', DELETE: 'suppression' };

export default function Audit() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    let q = supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(150);
    if (filter) q = q.eq('table_name', filter);
    q.then(({ data }) => setRows(data || []));
  }, [filter]);
  return (
    <section className="panel stack">
      <h2>Journal d’audit</h2>
      <select className="field" value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="">Tout</option>
        {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <p className="fine">Chaque ajout, modification et suppression est conservé avec l’avant et l’après, pour pouvoir restaurer une donnée supprimée par erreur.</p>
      <div className="list">
        {rows.map((r) => (
          <div className="line" key={r.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <button className="player" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <span><b>{LABELS[r.table_name] || r.table_name}</b> · {ACTIONS[r.action] || r.action}</span>
              <span className="fine">{fmtDateTime(r.at)}</span>
            </button>
            {open === r.id && (
              <>
                {r.old_data && <pre className="json">Avant: {JSON.stringify(r.old_data, null, 1)}</pre>}
                {r.row_data && <pre className="json">Après: {JSON.stringify(r.row_data, null, 1)}</pre>}
              </>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="fine">Rien pour l’instant.</div>}
      </div>
    </section>
  );
}
