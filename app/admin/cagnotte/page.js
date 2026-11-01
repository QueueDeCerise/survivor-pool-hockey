'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase, frError } from '@/lib/supabase';
import { ENTRY_FEE, TIMEZONE } from '@/lib/config';
import { fmtDate } from '@/lib/time';
import s from './cagnotte.module.css';

const METHODS = { interac: 'Virement Interac', mains_propres: 'En mains propres' };
const OTHER = '__autre__';

// Date du jour (Toronto) au format AAAA-MM-JJ
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const localDate = (ts) => (ts ? new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)) : null);
const money = (n) => {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')) + ' $';
};
const round2 = (n) => Math.floor(Number(n || 0) * 100) / 100;

function RoundCard({ round, champ, payouts, onChange }) {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState('');
  const [otherName, setOtherName] = useState('');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(todayLocal());
  const [method, setMethod] = useState('interac');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase.rpc('admin_round_payout_info', { p_round: round.id }).then(({ data, error }) => {
      if (error) setErr(frError(error));
      setInfo(data || []);
    });
  }, [round.id]);

  const winners = (info || []).filter((w) => w.user_id);
  const fee = round.fee != null ? Number(round.fee) : ENTRY_FEE;
  const calcPot = info && info[0] ? Number(info[0].pot) : 0;
  const pot = champ && champ.pot != null ? Number(champ.pot) : calcPot;
  const share = winners.length > 0 ? round2(pot / winners.length) : pot;
  const paidTotal = payouts.reduce((t, p) => t + Number(p.amount), 0);
  const left = Math.round((pot - paidTotal) * 100) / 100;
  const paidIds = new Set(payouts.map((p) => p.user_id).filter(Boolean));
  const done = pot > 0 ? left <= 0 : payouts.length > 0;

  const startForm = () => {
    const next = winners.find((w) => !paidIds.has(w.user_id));
    setWho(next ? next.user_id : winners[0] ? winners[0].user_id : OTHER);
    const suggested = winners.length > 1 ? Math.min(share, Math.max(left, 0)) : Math.max(left, 0);
    setAmount(suggested > 0 ? String(suggested).replace('.', ',') : '');
    setPaidOn(todayLocal()); setMethod('interac'); setNote(''); setOtherName(''); setErr('');
    setOpen(true);
  };

  const save = async () => {
    setErr('');
    const amt = Number(String(amount).replace(',', '.').replace(/[^\d.]/g, ''));
    if (!amt || amt <= 0) { setErr('Inscris un montant valide.'); return; }
    if (!paidOn) { setErr('Choisis la date du paiement.'); return; }
    const w = winners.find((x) => x.user_id === who);
    const name = w ? w.display_name : otherName.trim();
    if (!name) { setErr('Inscris le nom de la personne payée.'); return; }
    setBusy(true);
    const { error } = await supabase.from('pot_payouts').insert({
      round_id: round.id, user_id: w ? w.user_id : null, winner_name: name,
      amount: amt, paid_on: paidOn, method, note: note.trim() || null,
    });
    setBusy(false);
    if (error) { setErr(frError(error)); return; }
    setOpen(false);
    onChange();
  };

  const remove = async (p) => {
    if (!window.confirm(`Effacer le paiement de ${money(p.amount)} à ${p.winner_name}?`)) return;
    const { error } = await supabase.from('pot_payouts').delete().eq('id', p.id);
    if (error) { setErr(frError(error)); return; }
    onChange();
  };

  return (
    <section className={s.card}>
      <div className={s.head}>
        <div>
          <div className={s.title}>Ronde {round.number}</div>
          <div className={s.meta}>
            Terminée {round.finished_at ? 'le ' + fmtDate(localDate(round.finished_at)) : ''} · cagnotte {money(pot)}
            {info && info[0] ? <> ({info[0].nb_paid} payé{info[0].nb_paid > 1 ? 's' : ''} × {money(fee)})</> : null}
          </div>
        </div>
        <span className={done ? s.ok : s.wait}>{done ? '✅ Payée' : payouts.length ? '⏳ Partielle' : '⏳ À payer'}</span>
      </div>

      {err && <div className="msg err" role="alert">{err}</div>}

      {!info ? <div className="fine">Chargement…</div> : (
        <div className={s.line}>
          <strong>{winners.length > 1 ? 'Gagnants' : 'Gagnant'} :</strong>{' '}
          {winners.length === 0 ? <span className={s.muted}>aucun gagnant inscrit</span> : winners.map((w, i) => (
            <span key={w.user_id}>{i > 0 && ', '}{w.display_name}{w.left_pool && <span className={s.muted}> (a quitté le pool)</span>}{paidIds.has(w.user_id) && ' ✓'}</span>
          ))}
          {winners.length > 1 && <span className={s.muted}> · cagnotte divisée : {money(share)} chacun</span>}
        </div>
      )}

      {payouts.length > 0 && (
        <div className={s.wrap}>
          <table className={s.t}>
            <thead><tr><th>Payé à</th><th>Montant</th><th>Date</th><th>Format</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>{p.winner_name}</td>
                  <td className={s.mono}>{money(p.amount)}</td>
                  <td className={s.mono}>{fmtDate(p.paid_on)}</td>
                  <td>{METHODS[p.method] || p.method}</td>
                  <td>{p.note || <span className={s.muted}>—</span>}</td>
                  <td><button className={s.x} onClick={() => remove(p)} aria-label="Effacer ce paiement" title="Effacer ce paiement">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {payouts.length > 0 && pot > 0 && (
        <div className={s.meta}>Total versé : {money(paidTotal)} sur {money(pot)}{left > 0 ? ` · reste ${money(left)}` : left < 0 ? ` · ${money(-left)} de plus que la cagnotte` : ''}</div>
      )}

      {!open ? (
        <div><button className="btn small" onClick={startForm} disabled={!info}>+ Noter un paiement</button></div>
      ) : (
        <div className={s.form}>
          <label>Payé à
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              {winners.map((w) => <option key={w.user_id} value={w.user_id}>{w.display_name}</option>)}
              <option value={OTHER}>Autre personne…</option>
            </select>
          </label>
          {who === OTHER && <label>Nom<input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Nom de la personne" /></label>}
          <label>Montant ($)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></label>
          <label>Date du paiement<input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></label>
          <fieldset className={s.radios}>
            <legend>Format</legend>
            {Object.entries(METHODS).map(([k, label]) => (
              <label key={k} className={s.radio}><input type="radio" name={'m' + round.id} checked={method === k} onChange={() => setMethod(k)} /> {label}</label>
            ))}
          </fieldset>
          <label className={s.full}>Note (optionnel)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: confirmation Interac C1A2B3" /></label>
          <div className={s.full} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le paiement'}</button>
            <button className="btn secondary" onClick={() => setOpen(false)} disabled={busy}>Annuler</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Cagnotte() {
  const [rounds, setRounds] = useState(null);
  const [champs, setChamps] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [err, setErr] = useState('');

  const loadPayouts = async (ids) => {
    if (!ids.length) { setPayouts([]); return; }
    const { data, error } = await supabase.from('pot_payouts').select('*').in('round_id', ids).order('paid_on').order('id');
    if (error) setErr(frError(error));
    setPayouts(data || []);
  };

  useEffect(() => {
    (async () => {
      const [{ data: rs, error }, { data: ch }] = await Promise.all([
        supabase.from('rounds').select('id, number, status, start_date, fee, finished_at').eq('status', 'terminee').order('number', { ascending: false }),
        supabase.rpc('round_champions'),
      ]);
      if (error) setErr(frError(error));
      setRounds(rs || []);
      setChamps(ch || []);
      await loadPayouts((rs || []).map((r) => r.id));
    })();
  }, []);

  const ids = (rounds || []).map((r) => r.id);
  const total = payouts.reduce((t, p) => t + Number(p.amount), 0);

  return (
    <main className="page">
      <div>
        <div className="eyebrow">Bureau du commissaire</div>
        <h1>Cagnotte</h1>
      </div>
      <p className="fine" style={{ margin: 0 }}>Garde une trace de chaque cagnotte versée : à qui, combien, quand et comment. Si la cagnotte est partagée, note un paiement par gagnant. Visible par le Commissaire seulement.</p>
      {err && <div className="msg err" role="alert">{err}</div>}
      {!rounds ? <div className="fine">Chargement…</div> : rounds.length === 0 ? (
        <div className="msg info">Aucune ronde terminée dans la saison en cours.</div>
      ) : (
        <>
          <div className={s.meta}>{rounds.length} ronde{rounds.length > 1 ? 's' : ''} terminée{rounds.length > 1 ? 's' : ''} · total versé cette saison : {money(total)}</div>
          {rounds.map((r) => (
            <RoundCard key={r.id} round={r} champ={champs.find((c) => c.round_id === r.id)} payouts={payouts.filter((p) => p.round_id === r.id)} onChange={() => loadPayouts(ids)} />
          ))}
        </>
      )}
    </main>
  );
}

export default function Page() {
  return <AppShell requireAdmin><Cagnotte /></AppShell>;
}
