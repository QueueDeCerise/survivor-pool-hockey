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

// Est-ce que l'écran est (presque) au bas du fil?
function nearBottom() {
  const el = document.documentElement;
  return window.innerHeight + window.scrollY >= el.scrollHeight - 180;
}

function toBottom(smooth) {
  // Deux images pour laisser le navigateur placer le nouveau message avant de défiler
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }));
}

// Mode sombre: la patinoire après la fermeture des lumières (s'applique à tout l'écran, seulement au Vestiaire)
const NUIT_CSS = `
body.sph-nuit {
  --paper: #18212b; --ink: #e9eff5; --muted: #93a3b4; --line: #2b3846; --soft: #202b37;
  --red: #e2434c; --err: #ff8a8a; --err-soft: #3b1c21; --green: #6fdc9b; --green-soft: #183326;
  --gold: #f0c35a; --gold-soft: #2c2614;
  color-scheme: dark; background: #0d1319 !important; background-image: none !important; color: var(--ink);
}
html:has(body.sph-nuit) { background: #0d1319; }
body.sph-nuit .shell { background: transparent !important; }
body.sph-nuit .top, body.sph-nuit .nav { background: #121a22 !important; border-color: var(--line) !important; color: var(--ink) !important; }
body.sph-nuit .nav a { color: var(--muted) !important; }
body.sph-nuit .nav a.on { color: var(--ink) !important; }
body.sph-nuit .who { color: var(--ink) !important; }
body.sph-nuit .sub { color: var(--muted) !important; }
body.sph-nuit .btn.secondary { background: var(--soft) !important; color: var(--ink) !important; border-color: var(--line) !important; }
`;

function Chat({ ctx }) {
  const uid = ctx.user.id;
  const isAdmin = ctx.profile.is_admin;
  const [authors, setAuthors] = useState({});
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(0);
  const [navH, setNavH] = useState(null);
  const [composerH, setComposerH] = useState(70);
  const authorsRef = useRef({});
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(0);
  const composerRef = useRef(null);
  const [nuit, setNuit] = useState(false);

  // Mode sombre du Vestiaire: mémorisé sur l'appareil (sinon, suit le réglage du téléphone/ordinateur)
  useEffect(() => {
    let v = null;
    try { v = localStorage.getItem('sph-vestiaire-nuit'); } catch (e) {}
    const sys = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setNuit(v === null ? !!sys : v === '1');
  }, []);
  useEffect(() => {
    document.body.classList.toggle('sph-nuit', nuit);
    const meta = document.querySelector('meta[name="theme-color"]');
    const old = meta ? meta.getAttribute('content') : null;
    if (meta && nuit) meta.setAttribute('content', '#0d1319');
    return () => { document.body.classList.remove('sph-nuit'); if (meta && old) meta.setAttribute('content', old); };
  }, [nuit]);
  const toggleNuit = () => {
    setNuit((n) => {
      try { localStorage.setItem('sph-vestiaire-nuit', n ? '0' : '1'); } catch (e) {}
      return !n;
    });
  };

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
      const list = (data || []).reverse();
      prevLenRef.current = list.length;
      setMsgs(list);
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

  // Suit la position de l'écran: au bas du fil ou en train de relire plus haut
  useEffect(() => {
    const onScroll = () => {
      atBottomRef.current = nearBottom();
      if (atBottomRef.current) setPending(0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Place la zone d'écriture juste au-dessus de la barre d'onglets, peu importe sa hauteur
  useEffect(() => {
    const measure = () => {
      const nav = document.querySelector('nav.nav');
      if (nav) setNavH(nav.offsetHeight);
      if (composerRef.current) setComposerH(composerRef.current.offsetHeight);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    const nav = document.querySelector('nav.nav');
    if (ro && nav) ro.observe(nav);
    if (ro && composerRef.current) ro.observe(composerRef.current);
    window.addEventListener('resize', measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [loading]);

  // À l'ouverture: directement au dernier message
  useEffect(() => { if (!loading) { toBottom(false); atBottomRef.current = true; } }, [loading]);

  // Nouveau message: on descend si on était au bas du fil ou si c'est mon message
  useEffect(() => {
    if (loading) return;
    const added = msgs.length - prevLenRef.current;
    prevLenRef.current = msgs.length;
    if (added <= 0) return;
    const last = msgs[msgs.length - 1];
    if ((last && last.user_id === uid) || atBottomRef.current) {
      toBottom(true);
      setPending(0);
    } else {
      setPending((n) => n + added);
    }
  }, [msgs.length]); // eslint-disable-line

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
    toBottom(true);
  }

  async function remove(m) {
    if (!confirm('Supprimer ce message?')) return;
    const { error } = await supabase.from('chat_messages').delete().eq('id', m.id);
    if (error) return setErr(frError(error));
    setMsgs((x) => x.filter((y) => y.id !== m.id));
  }

  let lastDay = null;
  const bottomGap = navH !== null ? navH + composerH + 24 : undefined;

  return (
    <main className={s.wrap + (nuit ? ' ' + s.nuit : '')} style={bottomGap ? { paddingBottom: bottomGap } : undefined}>
      {nuit && <style>{NUIT_CSS}</style>}
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
                    {a.is_admin && <span className={s.staff}>Commissaire</span>}
                    <span>{fmtTime(m.created_at)}</span>
                    {(mine || isAdmin) && <button className={s.del} onClick={() => remove(m)} aria-label="Supprimer le message">✕</button>}
                  </div>
                  <div className={s.bubble}>{m.body}</div>
                </div>
              </div>
            );
          })}
      </div>

      {err && <div className="msg err" role="alert">{err}</div>}

      <form ref={composerRef} className={s.composer} onSubmit={send} style={navH !== null ? { bottom: navH } : undefined}>
        {pending > 0 && (
          <button type="button" className={s.jump} onClick={() => { setPending(0); toBottom(true); }}>
            {pending} nouveau{pending > 1 ? 'x' : ''} message{pending > 1 ? 's' : ''} ↓
          </button>
        )}
        <button type="button" className={s.mode} onClick={toggleNuit} aria-pressed={nuit} aria-label={nuit ? 'Passer au mode clair' : 'Passer au mode sombre'} title={nuit ? 'Mode clair' : 'Mode sombre'}>
          <span aria-hidden="true">{nuit ? '☀️' : '🌙'}</span>
        </button>
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
