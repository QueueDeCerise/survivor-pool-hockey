'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, frError } from '@/lib/supabase';

export default function Connexion() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace('/predictions'); });
  }, [router]);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setError(frError(error)); return; }
    router.replace('/predictions');
  }

  return (
    <main className="auth">
      <div className="brand">Survivor<small>Pool Hockey 2026-27</small></div>
      <p className="lead">Un joueur par jour. Survis ou disparais.</p>
      <form className="stack" onSubmit={submit}>
        <label className="lbl">Adresse courriel
          <input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="lbl">Mot de passe
          <input className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="msg err" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Entrer'}</button>
      </form>
      <div className="switch"><Link href="/mot-de-passe-oublie">Mot de passe oublié?</Link></div>
      <div className="switch">Nouveau? <Link href="/inscription">Créer mon profil</Link></div>
    </main>
  );
}
