'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, frError } from '@/lib/supabase';
import { ENTRY_FEE, INTERAC_EMAIL, MANAGER_NAME } from '@/lib/config';

export default function Inscription() {
  const router = useRouter();
  const [f, setF] = useState({ first: '', last: '', nick: '', email: '', pw: '', pw2: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!f.first.trim() || !f.last.trim()) return setError('Le prénom et le nom sont obligatoires.');
    if (f.pw.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.');
    if (f.pw !== f.pw2) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.pw,
      options: {
        data: { first_name: f.first.trim(), last_name: f.last.trim(), nickname: f.nick.trim() },
        emailRedirectTo: window.location.origin + '/connexion',
      },
    });
    setBusy(false);
    if (error) return setError(frError(error));
    if (data.session) router.replace('/reglements');
    else setSent(true);
  }

  if (sent) {
    return (
      <main className="auth">
        <div className="brand">Presque!<small>Confirme ton courriel</small></div>
        <p className="lead">Un lien de confirmation vient d’être envoyé à <b>{f.email}</b>. Clique dessus, puis connecte-toi.</p>
        <Link className="btn" href="/connexion" style={{ textAlign: 'center', textDecoration: 'none' }}>Aller à la connexion</Link>
      </main>
    );
  }

  return (
    <main className="auth">
      <div className="brand">Inscription<small>Pool Hockey 2026-27</small></div>
      <p className="lead">{ENTRY_FEE} $ par ronde, par virement Interac à {MANAGER_NAME} ({INTERAC_EMAIL}).</p>
      <form className="stack" onSubmit={submit}>
        <div className="row">
          <label className="lbl">Prénom<input className="field" required autoComplete="given-name" value={f.first} onChange={set('first')} /></label>
          <label className="lbl">Nom<input className="field" required autoComplete="family-name" value={f.last} onChange={set('last')} /></label>
        </div>
        <label className="lbl">Surnom <span className="hint">facultatif, affiché au classement (2 changements max)</span>
          <input className="field" value={f.nick} onChange={set('nick')} maxLength={24} />
        </label>
        <label className="lbl">Adresse courriel <span className="hint">privée, visible seulement par le gestionnaire</span>
          <input className="field" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
        </label>
        <label className="lbl">Mot de passe <span className="hint">8 caractères minimum</span>
          <input className="field" type="password" required autoComplete="new-password" value={f.pw} onChange={set('pw')} />
        </label>
        <label className="lbl">Confirmer le mot de passe
          <input className="field" type="password" required autoComplete="new-password" value={f.pw2} onChange={set('pw2')} />
        </label>
        {error && <div className="msg err" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer mon profil'}</button>
      </form>
      <div className="switch">Déjà inscrit? <Link href="/connexion">Se connecter</Link></div>
    </main>
  );
}
