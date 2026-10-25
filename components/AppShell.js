'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { RULES_VERSION } from '@/lib/config';
import { displayName } from '@/lib/time';
import Champion from '@/components/Champion';
import EnLigne from '@/components/EnLigne';

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
    if (!profile || profile.deleted_at) { await supabase.auth.signOut(); router.replace('/connexion'); return; }
    // Le commissaire ne participe pas: pas de règlements à accepter, pas de prédictions personnelles
    if (profile.is_admin && pathname.startsWith('/predictions')) { router.replace('/admin'); return; }
    if (!acc && !allowWithoutRules && !profile.is_admin) { router.replace('/reglements'); return; }
    if (requireAdmin && !profile.is_admin) { router.replace('/predictions'); return; }
    setCtx({ user: session.user, profile, acceptance: acc, reload: load });

    // Champion récent (7 derniers jours) de la saison en cours, sauf s'il a été masqué
    const [{ data: champs }, { data: vis }] = await Promise.all([
      supabase.rpc('round_champions'),
      supabase.from('rounds').select('id'),
    ]);
    const visible = new Set((vis || []).map((r) => r.id));
    const recent = (champs || []).find((c) => visible.has(c.round_id) && c.finished_at && Date.now() - new Date(c.finished_at).getTime() < 7 * 86400000);
    let hidden = false;
    try { hidden = !!recent && localStorage.getItem('sph-champion-masque-' + recent.round_id) === '1'; } catch (e) {}
    setChampion(recent && !hidden ? recent : null);

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
    ? [['/admin', 'Gestion'], ['/du-jour', 'Prédictions du jour'], ['/classement', 'Classement'], ['/vestiaire', 'Vestiaire'], ['/profil', 'Profil']]
    : [['/predictions', 'Mes prédictions'], ['/du-jour', 'Prédictions du jour'], ['/classement', 'Classement'], ['/vestiaire', 'Vestiaire'], ['/profil', 'Profil']];

  const subPage = pathname.startsWith('/admin/saisons') || pathname.startsWith('/admin/comptes');
  const showChampion = champion && (pathname.startsWith('/predictions') || (pathname.startsWith('/admin') && !subPage));
  // Le « x » apparaît après 2 jours d'affichage
  const canHide = champion && champion.finished_at && Date.now() - new Date(champion.finished_at).getTime() >= 2 * 86400000;
  const hideChampion = () => {
    try { localStorage.setItem('sph-champion-masque-' + champion.round_id, '1'); } catch (e) {}
    setChampion(null);
  };

  // 5 onglets: les libellés longs peuvent passer sur deux lignes sur cellulaire
  const tabStyle = { textAlign: 'center', lineHeight: 1.15, whiteSpace: 'normal', minWidth: 0, flex: '1 1 0', padding: '8px 2px', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const adminLinks = [['/admin', '🏒 Bureau'], ['/admin/saisons', '🗄️ Saisons et archives'], ['/admin/comptes', '👤 Comptes']];
  const adminOn = (href) => (href === '/admin' ? pathname === '/admin' || (pathname.startsWith('/admin') && !subPage) : pathname.startsWith(href));

  return (
    <div className="shell">
      <header className="top">
        <div className="id">
          <img className="crest" src="/logo.png" alt="" width="38" height="43" />
          <div>
            <div className="who">{displayName(ctx.profile)}</div>
            <div className="sub">{ctx.profile.is_admin ? 'Commissaire du pool' : 'Survivor Pool Hockey'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <EnLigne uid={ctx.user.id} name={displayName(ctx.profile)} isAdmin={!!ctx.profile.is_admin} />
          <button className="btn secondary small" onClick={() => supabase.auth.signOut()}>Quitter</button>
        </div>
      </header>
      {ctx.profile.is_admin && pathname.startsWith('/admin') && (
        <div style={{ padding: '10px 18px 0', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
          {adminLinks.map(([href, label]) => (
            <Link key={href} href={href} className={'btn small' + (adminOn(href) ? '' : ' secondary')} aria-current={adminOn(href) ? 'page' : undefined}>{label}</Link>
          ))}
        </div>
      )}
      {showChampion && (
        <div style={{ padding: '18px 18px 0' }}>
          <Champion compact name={champion.display_name} round={champion.round_number} pot={champion.pot} winners={champion.winners} share={champion.share} onClose={canHide ? hideChampion : undefined} />
        </div>
      )}
      {typeof children === 'function' ? children(ctx) : children}
      {(ctx.acceptance || ctx.profile.is_admin) && (
        <nav className="nav">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={pathname.startsWith(href) ? 'on' : ''} style={tabStyle}>
              <span>
                {label}
                {href === '/vestiaire' && unread && !pathname.startsWith('/vestiaire') && (
                  <span aria-label="nouveaux messages" style={{ display: 'inline-block', width: 8, height: 8, marginLeft: 5, borderRadius: '50%', background: 'var(--red)', verticalAlign: 'middle' }} />
                )}
              </span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
