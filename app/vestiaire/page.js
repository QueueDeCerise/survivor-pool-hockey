'use client';
import { useEffect, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase, frError } from '@/lib/supabase';
import { fmtDate, fmtTime } from '@/lib/time';
import { TIMEZONE } from '@/lib/config';
import s from './vestiaire.module.css';

const dayKey = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
const COLS = 'id, user_id, body, created_at';

function markSeen() {
  try { localStorage.setItem('sph-chat-seen', new Date().toISOString()); window.dispatchEvent(new Event('sph-chat-seen')); } catch (e) {}
}

function Chat({ ctx }) {
  const uid = ctx.user.id;
  const isAdmin = ctx.profile.is_admin;
  const [authors, setAuthors] = useState({});
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);
  const authorsRef = useRef({});

  async function loadAuthors() {
    const { data } = await supabase.rpc('chat_authors');
    const m = {};
    (data || []).forEach((a) => { m[a.id] = a; });
    authorsRef.current = m;
    setAuthors(m);
  }

  useEffect(() => {
    (async () => {
      await loadAuthors();
      const { data, error } = await supabase.from('chat_messages').select(COLS).order('created_at', { ascending: false }).limit(200);
      if (error) setErr(frError(error));
      setMsgs((data || []).reverse());
      setLoading(false);
      markSeen();
    })();
    const ch = supabase.channel('vestiaire-fil')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (p) => {
        if (!authorsRef.current[p.new.user_id]) loadAuthors();
        setMsgs((m) => (m.some((x) => x.id === p.new.id) ? m : [...m, p.new]));
        markSeen();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (p) => {
        setMsgs((m) => m.filter((x) => x.id !== p.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  async function send(e) {
    if (e) e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setErr('');
    const { data, error } = await supabase.from('chat_messages').insert({ user_id: uid, body }).select(COLS).single();
    setBusy(false);
    if (error) return setErr(frError(error));
    setText('');
    setMsgs((m) => (m.some((x) => x.id === data.id) ? m : [...m, data]));
  }

  async function remove(m) {
    if (!confirm('Supprimer ce message?')) return;
    const { error } = await supabase.from('chat_messages').delete().eq('id', m.id);
    if (error) return setErr(frError(error));
    setMsgs((x) => x.filter((y) => y.id !== m.id));
  }

  let lastDay = null;

  return (
    <main className={s.wrap}>
      <div className={s.rule} role="note">
        <span aria-hidden="true">🤫</span>
        <span><b>Les prédictions restent secrètes.</b> Ne révèle jamais un choix, le tien ou celui d’un autre, avant sa publication officielle. Tout message qui le fait sera supprimé.</span>
      </div>

      <div className={s.feed} aria-live="polite">
        {loading ? <div className={s.empty}>Chargement du vestiaire…</div>
          : msgs.length === 0 ? <div className={s.empty}><b>Le vestiaire est encore vide.</b>Lance la discussion!</div>
          : msgs.map((m) => {
            const a = authors[m.user_id] || { display_name: '…', is_admin: false };
            const mine = m.user_id === uid;
            const k = dayKey(m.created_at);
            const divider = k !== lastDay ? <div className={s.day}>{fmtDate(k)}</div> : null;
            lastDay = k;
            return (
              <div key={m.id} style={{ display: 'contents' }}>
                {divider}
                <div className={s.row + (mine ? ' ' + s.mine : '')}>
                  <div className={s.meta}>
                    <b>{mine ? 'Moi' : a.display_name}</b>
                    {a.is_admin && <span className={s.staff}>Gestionnaire</span>}
                    <span>{fmtTime(m.created_at)}</span>
                    {(mine || isAdmin) && <button className={s.del} onClick={() => remove(m)} aria-label="Supprimer le message">✕</button>}
                  </div>
                  <div className={s.bubble}>{m.body}</div>
                </div>
              </div>
            );
          })}
        <div ref={endRef} />
      </div>

      {err && <div className="msg err" role="alert">{err}</div>}

      <form className={s.composer} onSubmit={send}>
        <textarea
          className={s.input}
          rows={1}
          maxLength={500}
          placeholder="Écris au vestiaire…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          aria-label="Message"
        />
        <button className="btn" type="submit" disabled={!text.trim() || busy}>Envoyer</button>
      </form>
    </main>
  );
}

export default function Page() {
  return <AppShell>{(ctx) => <Chat ctx={ctx} />}</AppShell>;
}
