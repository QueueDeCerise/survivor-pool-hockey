'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { RULES_VERSION } from '@/lib/config';
import { displayName } from '@/lib/time';
import Champion from '@/components/Champion';

export default function AppShell({ children, requireAdmin = false, allowWithoutRules = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ctx, setCtx] = useState(null);
  const [champion, setChampion] = useState(null);
  const [unread, setUnread] = useState(false);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace('/connexion'); return; }
    const uid = session.user.id;
    const [{ data: profile }, { data: acc }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('rule_acceptances').select('version, accepted_at').eq('user_id', uid).eq('version', RULES_VERSION).maybeSingle(),
    ]);
    if (!profile) { await supabase.auth.signOut(); router.replace('/connexion'); return; }
    // Le gestionnaire ne participe pas: pas de règlements à accepter, pas de prédictions
    if (profile.is_admin && pathname.startsWith('/predictions')) { router.replace('/admin'); return; }
    if (!acc && !allowWithoutRules && !profile.is_admin) { router.replace('/reglements'); return; }
    if (requireAdmin && !profile.is_admin) { router.replace('/predictions'); return; }
    setCtx({ user: session.user, profile, acceptance: acc, reload: load });

    // Champion récent (7 derniers jours), affiché sur la page d'accueil
    const { data: champs } = await supabase.rpc('round_champions');
    const recent = (champs || []).find((c) => c.finished_at && Date.now() - new Date(c.finished_at).getTime() < 7 * 86400000);
    setChampion(recent || null);

    // Nouveaux messages au Vestiaire depuis la dernière visite
    if (!pathname.startsWith('/vestiaire')) {
      const { data: last } = await supabase.from('chat_messages').select('created_at, user_id').order('created_at', { ascending: false }).limit(1).maybeSingle();
      let seen = null;
      try { seen = localStorage.getItem('sph-chat-seen'); } catch (e) {}
      if (last && last.user_id !== uid && (!seen || new Date(last.created_at) > new Date(seen))) setUnread(true);
    }
  }

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/connexion');
    });
    const seen = () => setUnread(false);
    window.addEventListener('sph-chat-seen', seen);
    let ch = null;
    if (!pathname.startsWith('/vestiaire')) {
      ch = supabase.channel('vestiaire-pastille')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (p) => {
          const { data: { session } } = await supabase.auth.getSession();
          if (session && p.new.user_id !== session.user.id) setUnread(true);
        })
        .subscribe();
    }
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener('sph-chat-seen', seen);
      if (ch) supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ctx) return <div className="loading">Chargement…</div>;

  const links = ctx.profile.is_admin
    ? [['/admin', 'Gestion'], ['/classement', 'Classement'], ['/vestiaire', 'Vestiaire'], ['/profil', 'Profil']]
    : [['/predictions', 'Prédiction'], ['/classement', 'Classement'], ['/vestiaire', 'Vestiaire'], ['/profil', 'Profil']];

  const showChampion = champion && (pathname.startsWith('/predictions') || pathname.startsWith('/admin'));

  return (
    <div className="shell">
      <header className="top">
        <div className="id">
          <img className="crest" src="/logo.png" alt="" width="38" height="43" />
          <div>
            <div className="who">{displayName(ctx.profile)}</div>
            <div className="sub">{ctx.profile.is_admin ? 'Gestionnaire du pool' : 'Survivor Pool Hockey'}</div>
          </div>
        </div>
        <button className="btn secondary small" onClick={() => supabase.auth.signOut()}>Quitter</button>
      </header>
      {showChampion && (
        <div style={{ padding: '18px 18px 0' }}>
          <Champion compact name={champion.display_name} round={champion.round_number} pot={champion.pot} />
        </div>
      )}
      {typeof children === 'function' ? children(ctx) : children}
      {(ctx.acceptance || ctx.profile.is_admin) && (
        <nav className="nav">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={pathname.startsWith(href) ? 'on' : ''}>
              {label}
              {href === '/vestiaire' && unread && !pathname.startsWith('/vestiaire') && (
                <span aria-label="nouveaux messages" style={{ display: 'inline-block', width: 8, height: 8, marginLeft: 5, borderRadius: '50%', background: 'var(--red)', verticalAlign: 'middle' }} />
              )}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
