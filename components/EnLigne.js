'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import s from './EnLigne.module.css';

// Qui est dans l'application en ce moment? (Supabase Realtime Presence, aucune table nécessaire)
export default function EnLigne({ uid, name, isAdmin }) {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState({}); // user_id -> { name, admin }
  const [people, setPeople] = useState([]); // [{ id?, name, admin }]
  const boxRef = useRef(null);

  // Connexion au canal de présence: on s'annonce et on écoute les autres
  useEffect(() => {
    const ch = supabase.channel('sph-en-ligne', { config: { presence: { key: uid } } });
    const sync = () => {
      const st = ch.presenceState();
      const m = {};
      Object.keys(st).forEach((k) => {
        const meta = (st[k] || [])[0] || {};
        m[k] = { name: meta.name || '…', admin: !!meta.admin };
      });
      setOnline(m);
    };
    ch.on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await ch.track({ name, admin: isAdmin, at: new Date().toISOString() });
      });
    // Sur cellulaire: se réannoncer en revenant dans l'application
    const onVis = () => { if (document.visibilityState === 'visible') ch.track({ name, admin: isAdmin, at: new Date().toISOString() }); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); supabase.removeChannel(ch); };
  }, [uid, name, isAdmin]);

  // Liste des participants: auteurs connus + inscrits de la ronde en cours
  async function loadPeople() {
    const byName = {};
    const add = (n, extra) => { if (n && !byName[n]) byName[n] = { name: n, ...extra }; };
    try {
      const { data } = await supabase.rpc('chat_authors');
      (data || []).forEach((a) => add(a.display_name, { id: a.id, admin: !!a.is_admin }));
    } catch (e) {}
    try {
      const { data: rs } = await supabase.from('rounds').select('id, status, number').order('number', { ascending: false }).limit(3);
      const r = (rs || []).find((x) => x.status !== 'terminee') || (rs || [])[0];
      if (r) {
        const { data: st } = await supabase.rpc('standings', { p_round: r.id });
        (st || []).forEach((x) => add(x.display_name, { admin: false }));
      }
    } catch (e) {}
    setPeople(Object.values(byName));
  }

  useEffect(() => { if (open) loadPeople(); }, [open]); // eslint-disable-line

  // Fermer en cliquant ailleurs ou avec Échap
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const onlineIds = Object.keys(online);
  const onlineNames = new Set(Object.values(online).map((o) => o.name));
  const count = onlineIds.length;

  // Fusion: tout le monde connu + toute personne en ligne absente de la liste
  const all = [...people];
  Object.entries(online).forEach(([id, o]) => {
    if (!all.some((p) => p.id === id || p.name === o.name)) all.push({ id, name: o.name, admin: o.admin });
  });
  const isOn = (p) => (p.id && online[p.id]) || onlineNames.has(p.name);
  const rows = all
    .map((p) => ({ ...p, on: !!isOn(p), me: p.id === uid || p.name === name }))
    .sort((a, b) => (b.on - a.on) || (b.admin - a.admin) || a.name.localeCompare(b.name, 'fr'));

  return (
    <div className={s.box} ref={boxRef}>
      <button type="button" className={s.btn} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true" aria-label={`${count} connecté${count > 1 ? 's' : ''}, voir les participants`}>
        <span className={s.dot} aria-hidden="true" />
        <span className={s.n}>{count}</span>
        <span className={s.caret} aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={s.menu} role="menu">
          <div className={s.head}>
            <b>Participants</b>
            <span>{count} connecté{count > 1 ? 's' : ''}</span>
          </div>
          <div className={s.list}>
            {rows.length === 0 && <div className={s.empty}>Chargement…</div>}
            {rows.map((p) => (
              <div key={p.id || p.name} className={s.row + (p.on ? '' : ' ' + s.off)}>
                <span className={s.name}>
                  {p.name}{p.me && <span className={s.me}> (toi)</span>}
                  {p.admin && <span className={s.staff}>Commissaire</span>}
                </span>
                {p.on && <span className={s.on}><span className={s.dot} aria-hidden="true" />connecté</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
