'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase, frError } from '@/lib/supabase';
import { TIMEZONE } from '@/lib/config';
import { fmtDate } from '@/lib/time';
import s from './comptes.module.css';

// Date locale (heure de Toronto), pas la date UTC
const dateOf = (ts) => (ts ? new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)) : null);
const nameOf = (a) => a.nickname || a.first_name || '…';

function Accounts({ ctx }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [target, setTarget] = useState(null);
  const [confirmTxt, setConfirmTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [showGone, setShowGone] = useState(false);

  async function load() {
    const { data, error } = await supabase.rpc('admin_accounts');
    if (error) { setErr(frError(error)); setList([]); return; }
    setList(data || []);
  }
  useEffect(() => { load(); }, []);

  async function remove(e) {
    e.preventDefault();
    if (!target || busy) return;
    setBusy(true); setErr(''); setOk('');
    const { error } = await supabase.rpc('admin_delete_account', { p_user: target.id, p_confirm: confirmTxt.trim() });
    setBusy(false);
    if (error) return setErr(frError(error));
    setOk(`Le profil de ${nameOf(target)} est supprimé. Son historique reste dans les archives.`);
    setTarget(null); setConfirmTxt('');
    load();
  }

  if (!list) return <main className="page"><div className="loading">Chargement…</div></main>;

  const active = list.filter((a) => !a.deleted_at);
  const gone = list.filter((a) => a.deleted_at);
  const ready = confirmTxt.trim().toUpperCase() === 'SUPPRIMER';

  return (
    <main className="page">
      <div>
        <div className="eyebrow">Bureau du commissaire</div>
        <h1>Comptes des participants</h1>
        <p className="fine" style={{ margin: '4px 0 0' }}>Sur demande d’un participant, supprime son profil. Son compte de connexion, son courriel et son nom de famille sont effacés; son surnom, ses rondes, ses prédictions et ses messages restent dans les archives.</p>
      </div>

      {err && <div className="msg err" role="alert">{err}</div>}
      {ok && <div className="msg ok" role="status">{ok}</div>}

      <section className="panel">
        <div className={s.list}>
          {active.map((a) => {
            const locked = a.is_admin || a.id === ctx.user.id || a.active_round !== null;
            return (
              <div key={a.id} className={s.row}>
                <div className={s.who}>
                  <div className={s.name}>
                    {nameOf(a)}
                    {a.is_admin && <span className={s.staff}>Commissaire</span>}
                  </div>
                  <div className={s.meta}>
                    {[a.first_name, a.last_name].filter(Boolean).join(' ')}{a.email ? ' · ' + a.email : ''}
                  </div>
                  <div className={s.meta}>
                    Inscrit le {fmtDate(dateOf(a.created_at))} · {a.rounds_played} ronde{a.rounds_played > 1 ? 's' : ''}
                    {a.active_round !== null && <> · <b>inscrit à la ronde {a.active_round}</b></>}
                  </div>
                </div>
                {!a.is_admin && (
                  <button className="btn secondary small" disabled={locked} title={a.active_round !== null ? 'Inscrit à une ronde en cours ou ouverte' : ''} onClick={() => { setTarget(a); setConfirmTxt(''); setOk(''); setErr(''); }}>
                    Supprimer
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="fine" style={{ margin: '10px 0 0' }}>Le bouton est grisé tant que le participant est inscrit à une ronde en cours ou ouverte aux inscriptions.</p>
      </section>

      {target && (
        <section className={'panel stack ' + s.danger}>
          <h2 style={{ margin: 0 }}>Supprimer le profil de {nameOf(target)}?</h2>
          <ul className={s.effects}>
            <li><b>Effacés pour de bon:</b> compte de connexion, courriel ({target.email || 'aucun'}), nom de famille, acceptation des règlements.</li>
            <li><b>Conservés:</b> « {nameOf(target)} », ses {target.rounds_played} ronde{target.rounds_played > 1 ? 's' : ''}, prédictions, résultats et messages, marqués « a quitté le pool » dans les archives.</li>
            <li>S’il revient un jour, il devra se créer un nouveau compte (il repart à neuf).</li>
          </ul>
          <form className="stack" onSubmit={remove}>
            <label className={s.lbl}>Pour confirmer, écris <b>SUPPRIMER</b>
              <input className="field" autoComplete="off" placeholder="SUPPRIMER" value={confirmTxt} onChange={(e) => setConfirmTxt(e.target.value)} />
            </label>
            <div className="row">
              <button type="button" className="btn secondary" onClick={() => setTarget(null)}>Annuler</button>
              <button type="submit" className={'btn ' + s.go} disabled={!ready || busy}>{busy ? 'Suppression…' : 'Supprimer le profil'}</button>
            </div>
          </form>
        </section>
      )}

      {gone.length > 0 && (
        <section className="panel stack">
          <button className="btn secondary small" style={{ justifySelf: 'start' }} onClick={() => setShowGone((v) => !v)}>
            {showGone ? 'Masquer' : 'Voir'} les profils supprimés ({gone.length})
          </button>
          {showGone && (
            <div className={s.list}>
              {gone.map((a) => (
                <div key={a.id} className={s.row + ' ' + s.gone}>
                  <div className={s.who}>
                    <div className={s.name}>{nameOf(a)}</div>
                    <div className={s.meta}>A quitté le pool le {fmtDate(dateOf(a.deleted_at))} · {a.rounds_played} ronde{a.rounds_played > 1 ? 's' : ''} aux archives</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default function Page() {
  return <AppShell requireAdmin>{(ctx) => <Accounts ctx={ctx} />}</AppShell>;
}
