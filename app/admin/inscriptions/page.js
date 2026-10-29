'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase, frError } from '@/lib/supabase';
import { ENTRY_FEE, INTERAC_EMAIL, TIMEZONE } from '@/lib/config';
import { fmtDate } from '@/lib/time';
import s from './inscriptions.module.css';

// Date et heure locales (Toronto), format tableur: 2026-10-24 21:07
const fmtStamp = (ts) => {
  if (!ts) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

const COLS = ['#', 'Participant', 'Nom complet', 'Courriel', 'Inscrit le', 'Payé', 'Paiement confirmé le'];

function csvCell(v) {
  const t = v === null || v === undefined ? '' : String(v);
  return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

function Roster() {
  const [rounds, setRounds] = useState([]);
  const [roundId, setRoundId] = useState(null);
  const [rows, setRows] = useState(null);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    supabase.from('rounds').select('id, number, status, start_date, fee').order('number', { ascending: false }).then(({ data }) => {
      setRounds(data || []);
      const pick = (data || []).find((r) => r.status === 'inscriptions') || (data || []).find((r) => r.status === 'en_cours') || (data || [])[0];
      if (pick) setRoundId(pick.id); else setRows([]);
    });
  }, []);

  useEffect(() => {
    if (!roundId) return;
    setRows(null); setErr(''); setNote('');
    supabase.rpc('admin_round_roster', { p_round: roundId }).then(({ data, error }) => {
      if (error) setErr(frError(error));
      setRows(data || []);
    });
  }, [roundId]);

  const round = rounds.find((r) => r.id === roundId);
  const fee = round && round.fee != null ? Number(round.fee) : ENTRY_FEE;
  const all = rows || [];
  const shown = onlyUnpaid ? all.filter((r) => !r.paid) : all;
  const unpaid = all.filter((r) => !r.paid && r.email);
  const nbPaid = all.filter((r) => r.paid).length;

  const asRows = () => shown.map((r, i) => [
    i + 1,
    r.display_name + (r.left_pool ? ' (a quitté le pool)' : ''),
    r.full_name || '',
    r.email || '',
    fmtStamp(r.registered_at),
    r.paid ? 'Oui' : 'Non',
    fmtStamp(r.paid_at),
  ]);

  const exportCsv = () => {
    const text = '\ufeff' + [COLS, ...asRows()].map((r) => r.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `inscriptions-ronde-${round ? round.number : ''}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const copyTable = async () => {
    const text = [COLS, ...asRows()].map((r) => r.join('\t')).join('\n');
    try { await navigator.clipboard.writeText(text); setNote('Tableau copié: colle-le directement dans Excel.'); }
    catch (e) { setNote('Copie impossible sur cet appareil. Utilise plutôt « Exporter (Excel) ».'); }
  };

  const remindHref = () => {
    if (!round || unpaid.length === 0) return null;
    const subject = `Survivor Pool Hockey · Paiement de la ronde ${round.number}`;
    const body = `Salut!\n\nPetit rappel amical: ton inscription de ${fee} $ à la ronde ${round.number} (début ${fmtDate(round.start_date)}) n'est pas encore payée.\n\nEnvoie ton virement Interac à ${INTERAC_EMAIL} avant le début du premier match. Sans paiement, ton inscription pourrait être retirée.\n\nUn joueur par jour. Survis ou disparais.\nCommissaire Gordon`;
    return `mailto:?bcc=${unpaid.map((r) => encodeURIComponent(r.email)).join(',')}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  const href = remindHref();

  return (
    <main className="page">
      <div>
        <div className="eyebrow">Bureau du commissaire</div>
        <h1>Inscriptions</h1>
      </div>

      {rounds.length > 0 && (
        <div className="chips">
          {rounds.map((r) => (
            <button key={r.id} className={'chip' + (r.id === roundId ? ' on' : '')} onClick={() => setRoundId(r.id)}>
              Ronde {r.number}<small>{r.status === 'terminee' ? 'terminée' : r.status === 'en_cours' ? 'en cours' : 'inscriptions'}</small>
            </button>
          ))}
        </div>
      )}

      {err && <div className="msg err" role="alert">{err}</div>}
      {note && <div className="msg ok" role="status">{note}</div>}

      {rounds.length === 0 && rows ? <div className="msg info">Aucune ronde dans la saison en cours.</div> : !rows ? <div className="fine">Chargement…</div> : (
        <>
          <div className={s.bar}>
            <span className={s.sum}>{all.length} inscrit{all.length > 1 ? 's' : ''} · {nbPaid} payé{nbPaid > 1 ? 's' : ''} · {all.length - nbPaid} en attente · cagnotte {nbPaid * fee} $</span>
            <label className={s.filter}><input type="checkbox" checked={onlyUnpaid} onChange={(e) => setOnlyUnpaid(e.target.checked)} /> Non payés seulement</label>
          </div>

          <div className={s.wrap}>
            <table className={s.t}>
              <thead><tr>{COLS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr><td colSpan={COLS.length} className={s.empty}>{onlyUnpaid ? 'Tout le monde a payé.' : 'Aucune inscription.'}</td></tr>
                ) : shown.map((r, i) => (
                  <tr key={r.user_id} className={r.paid ? '' : s.unpaid}>
                    <td className={s.num}>{i + 1}</td>
                    <td>{r.display_name}{r.left_pool && <span className={s.muted}> (a quitté le pool)</span>}</td>
                    <td>{r.full_name}</td>
                    <td>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : <span className={s.muted}>—</span>}</td>
                    <td className={s.mono}>{fmtStamp(r.registered_at)}</td>
                    <td className={s.mono}>{r.paid ? 'Oui' : 'Non'}</td>
                    <td className={s.mono}>{fmtStamp(r.paid_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={s.actions}>
            {href
              ? <a className="btn" href={href}>Relancer les non-payés ({unpaid.length})</a>
              : <button className="btn" disabled>Relancer les non-payés (0)</button>}
            <button className="btn secondary" onClick={copyTable} disabled={!shown.length}>Copier le tableau</button>
            <button className="btn secondary" onClick={exportCsv} disabled={!shown.length}>Exporter (Excel)</button>
          </div>
          <p className="fine" style={{ margin: 0 }}>« Relancer » ouvre ton application de courriel avec un rappel prêt à envoyer. Les adresses sont en copie cachée: personne ne voit celles des autres.</p>
        </>
      )}
    </main>
  );
}

export default function Page() {
  return <AppShell requireAdmin><Roster /></AppShell>;
}
