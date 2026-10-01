'use client';
import Link from 'next/link';
import { useState } from 'react';
import { supabase, frError } from '@/lib/supabase';

export default function Oublie() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/nouveau-mot-de-passe' });
    if (error) setError(frError(error)); else setDone(true);
  }
  return (
    <main className="auth">
      <div className="brand">Oups<small>Mot de passe oublié</small></div>
      {done ? <p className="lead">Si un compte existe pour <b>{email}</b>, un lien de réinitialisation vient d’être envoyé.</p> : (
        <form className="stack" onSubmit={submit} style={{ marginTop: 24 }}>
          <label className="lbl">Adresse courriel<input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {error && <div className="msg err">{error}</div>}
          <button className="btn" type="submit">Envoyer le lien</button>
        </form>
      )}
      <div className="switch"><Link href="/connexion">Retour à la connexion</Link></div>
    </main>
  );
}
