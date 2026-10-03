'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/connexion'); return; }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', data.session.user.id).maybeSingle();
      router.replace(profile && profile.is_admin ? '/admin' : '/predictions');
    })();
  }, [router]);
  return <div className="loading">Chargement…</div>;
}
