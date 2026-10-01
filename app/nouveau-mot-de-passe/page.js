'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, frError } from '@/lib/supabase';

export default function NouveauMotDePasse() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => { if (session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);
  async function submit(e) {
    e.preventDefault(); setError('');
    if (pw.length < 8) return setError('8 caractères minimum.');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return setError(frError(error));
    router.replace('/predictions');
  }
  return (
    <main className="auth">
      <div className="brand">Nouveau<small>mot de passe</small></div>
      {!ready ? <p className="lead">Validation du lien…</p> : (
        <form className="stack" onSubmit={submit} style={{ marginTop: 24 }}>
          <label className="lbl">Nouveau mot de passe<input className="field" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          {error && <div className="msg err">{error}</div>}
          <button className="btn" type="submit">Enregistrer</button>
        </form>
      )}
    </main>
  );
}
