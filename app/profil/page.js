'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase, frError } from '@/lib/supabase';
import { INTERAC_EMAIL, RULES_VERSION } from '@/lib/config';
import { fmtDate, fmtDateTime } from '@/lib/time';

function Profile({ ctx }) {
  const p = ctx.profile;
  const [nick, setNick] = useState(p.nickname || '');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState(null);
  const [entries, setEntries] = useState([]);
  const [rounds, setRounds] = useState([]);
  const left = Math.max(0, 2 - p.nickname_changes);

  useEffect(() => {
    supabase.from('round_entries').select('*').eq('user_id', ctx.user.id).then(({ data }) => setEntries(data || []));
    supabase.from('rounds').select('*').order('number').then(({ data }) => setRounds(data || []));
  }, [ctx.user.id]);

  async function saveNick(e) {
    e.preventDefault();
    if ((nick.trim() || null) === (p.nickname || null)) return;
    if (!confirm(`Changer ton surnom? Il te restera ${left - 1} changement(s).`)) return;
    const { error } = await supabase.from('profiles').update({ nickname: nick.trim() || null }).eq('id', p.id);
    if (error) return setMsg({ t: 'err', m: frError(error) });
    setMsg({ t: 'ok', m: 'Surnom modifié.' });
    ctx.reload();
  }

  async function savePw(e) {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ t: 'err', m: 'Le mot de passe doit contenir au moins 8 caractères.' });
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return setMsg({ t: 'err', m: frError(error) });
    setPw('');
    setMsg({ t: 'ok', m: 'Mot de passe modifié.' });
  }

  const paidTotal = entries.filter((e) => e.paid).reduce((s, e) => s + Number((rounds.find((r) => r.id === e.round_id) || {}).fee || 0), 0);

  return (
    <main className="page">
      <div>
        <div className="eyebrow">Mon profil</div>
        <h1>{p.nickname || p.first_name}</h1>
        <div className="fine">{p.first_name} {p.last_name} · {ctx.user.email} (privé)</div>
      </div>
      {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}

      <section className="panel">
        <h2>Inscriptions par ronde</h2>
        <div className="list">
          {entries.map((e) => {
            const r = rounds.find((x) => x.id === e.round_id);
            if (!r) return null;
            return (
              <div className="line" key={e.round_id}>
                <div><div className="t">Ronde {r.number}</div><div className="s">Début {fmtDate(r.start_date)} · {e.lives} vie(s)</div></div>
                <div style={{ textAlign: 'right' }}><div className="mono">{Number(r.fee).toFixed(2)} $</div><span className={'badge ' + (e.paid ? 'ok' : 'wait')}>{e.paid ? 'Payée' : 'En attente'}</span></div>
              </div>
            );
          })}
          {entries.length === 0 && <div className="fine">Aucune inscription. Va dans Prédiction pour t’inscrire à une ronde.</div>}
        </div>
        <div className="line"><b>Total payé</b><b className="mono">{paidTotal.toFixed(2)} $</b></div>
        <p className="fine">Paiement par virement Interac à {INTERAC_EMAIL}.</p>
      </section>

      <section className="panel">
        <h2>Surnom</h2>
        <form className="stack" onSubmit={saveNick}>
          <input className="field" value={nick} maxLength={24} disabled={left === 0} onChange={(e) => setNick(e.target.value)} />
          <div className="fine">{left > 0 ? `${left} changement(s) restant(s).` : 'Limite de 2 changements atteinte.'}</div>
          <button className="btn secondary" type="submit" disabled={left === 0}>Enregistrer le surnom</button>
        </form>
      </section>

      <section className="panel">
        <h2>Mot de passe</h2>
        <form className="stack" onSubmit={savePw}>
          <input className="field" type="password" autoComplete="new-password" placeholder="Nouveau mot de passe" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="btn secondary" type="submit">Changer le mot de passe</button>
        </form>
      </section>

      <section className="panel">
        <h2>Règlements</h2>
        <p className="fine">Version {RULES_VERSION} acceptée le {fmtDateTime(ctx.acceptance && ctx.acceptance.accepted_at)}.</p>
        <Link href="/reglements">Relire les règlements</Link>
      </section>
    </main>
  );
}

export default function Page() {
  return <AppShell>{(ctx) => <Profile ctx={ctx} />}</AppShell>;
}
