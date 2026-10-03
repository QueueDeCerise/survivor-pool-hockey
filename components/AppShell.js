'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { RULES_VERSION } from '@/lib/config';
import { displayName } from '@/lib/time';

export default function AppShell({ children, requireAdmin = false, allowWithoutRules = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ctx, setCtx] = useState(null);

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
  }

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/connexion');
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ctx) return <div className="loading">Chargement…</div>;

  const links = ctx.profile.is_admin
    ? [['/admin', 'Gestion'], ['/classement', 'Classement'], ['/profil', 'Profil']]
    : [['/predictions', 'Prédiction'], ['/classement', 'Classement'], ['/profil', 'Profil']];

  return (
    <div className="shell">
      <header className="top">
        <div>
          <div className="who">{displayName(ctx.profile)}</div>
          <div className="sub">{ctx.profile.is_admin ? 'Gestionnaire du pool' : 'Survivor Pool Hockey'}</div>
        </div>
        <button className="btn secondary small" onClick={() => supabase.auth.signOut()}>Quitter</button>
      </header>
      {typeof children === 'function' ? children(ctx) : children}
      {(ctx.acceptance || ctx.profile.is_admin) && (
        <nav className="nav">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={pathname.startsWith(href) ? 'on' : ''}>{label}</Link>
          ))}
        </nav>
      )}
    </div>
  );
}
