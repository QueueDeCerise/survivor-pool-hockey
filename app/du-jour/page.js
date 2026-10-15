'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Lives from '@/components/Lives';
import { supabase } from '@/lib/supabase';
import { todayLocal, fmtShort } from '@/lib/time';
import s from './du-jour.module.css';

const OUTCOME = { survie: ['Survit', 'ok'], sans_point: ['Sans point', 'bad'], doublon: ['Perdu', 'bad'], aucun_choix: ['TARO', 'bad'] };
const TARO = 'TARO TSUJIMOTO';

function fmtLong(d) {
  if (!d) return '';
  const dt = new Date(String(d).slice(0, 10) + 'T12:00:00');
  const day = dt.getDate();
  const month = dt.toLocaleDateString('fr-CA', { month: 'long' });
  return (day === 1 ? '1er' : day) + ' ' + month;
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1];
}

// Bilan d'une ronde terminée: remplace les dates passées
function RoundSummary({ round, champ, rows, nbDays }) {
  if (!champ) {
    return (
      <section className={'panel ' + s.recap}>
        <div className={s.recapEyebrow}>Ronde {round.number} · terminée</div>
        <p className={s.recapText}>La glace est encore en train de refroidir. Le Commissaire annoncera le survivant sous peu.</p>
      </section>
    );
  }
  const names = String(champ.display_name || '').split(' · ').filter(Boolean);
  const shared = names.length > 1;
  const pot = Number(champ.pot) || 0;
  const share = Number(champ.share) || (shared ? Math.floor(pot / names.length) : pot);
  const lives = names.length === 1 ? ((rows.find((r) => r.display_name === names[0]) || {}).lives || 0) : 0;
  const jours = nbDays > 0 ? `${nbDays} jour${nbDays > 1 ? 's' : ''}` : null;

  return (
    <section className={'panel ' + s.recap}>
      <div className={s.recapEyebrow}>🏆 Ronde {round.number} · le dernier debout</div>
      <h2 className={s.recapName}>{shared ? joinNames(names) : names[0]}</h2>
      {shared ? (
        <p className={s.recapText}>
          Partis des vestiaires le <b>{fmtLong(round.start_date)}</b>, ils ont tenu le coup ensemble{jours && <> pendant <b>{jours}</b> de carnage</>}.
          Aucun n’a voulu céder sa place, alors ils se partagent le butin : <b className={s.cash}>{share} $</b> chacun dans la mitaine.
        </p>
      ) : (
        <p className={s.recapText}>
          Sorti des vestiaires le <b>{fmtLong(round.start_date)}</b>, {names[0]} a survécu{jours && <> à <b>{jours}</b> de carnage</>}
          {lives > 0 ? <>, a fini la ronde avec <b>{lives} vie{lives > 1 ? 's' : ''}</b> en banque</> : <>, a fini la ronde sur sa dernière rondelle</>}
          {' '}et repart avec <b className={s.cash}>{pot} $</b> dans la mitaine. Respect.
        </p>
      )}
      {!shared && lives > 0 && <div className={s.recapLives}><Lives n={lives} /></div>}
    </section>
  );
}

function DailyPicks() {
  const [rounds, setRounds] = useState([]);
  const [roundId, setRoundId] = useState(null);
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState([]);
  const [date, setDate] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [champs, setChamps] = useState([]);

  useEffect(() => {
    supabase.from('rounds').select('*').order('number', { ascending: false }).then(({ data }) => {
      setRounds(data || []);
      const active = (data || []).find((r) => r.status === 'en_cours') || (data || [])[0];
      if (active) setRoundId(active.id);
    });
    supabase.rpc('round_champions').then(({ data }) => setChamps(data || []));
  }, []);

  const round = rounds.find((r) => r.id === roundId);
  const champ = champs.find((c) => c.round_id === roundId);
  const finished = !!round && round.status === 'terminee';

  useEffect(() => {
    if (!round) return;
    supabase.rpc('standings', { p_round: round.id }).then(({ data }) => setRows(data || []));
    supabase.from('game_days').select('game_date, first_game_at, closed_at').gte('game_date', round.start_date).lte('game_date', todayLocal()).order('game_date', { ascending: false }).limit(60)
      .then(({ data }) => { setDays(data || []); setDate((data || [])[0] ? data[0].game_date : null); });
  }, [roundId]); // eslint-disable-line

  useEffect(() => {
    if (!round || !date) { setReveal(null); return; }
    supabase.rpc('revealed_picks', { p_round: round.id, p_date: date }).then(({ data }) => setReveal(data || []));
  }, [date, roundId]); // eslint-disable-line

  // Durée de la ronde: journées fermées entre le début et la fin de la ronde
  const endTs = champ && champ.finished_at ? new Date(champ.finished_at).getTime() + 15 * 60000 : Infinity;
  const nbDays = days.filter((d) => d.closed_at && new Date(d.closed_at).getTime() <= endTs).length;

  // Participants encore en vie sans prédiction: TARO TSUJIMOTO (avant la fermeture de la journée).
  const day = days.find((d) => d.game_date === date);
  const first = day && day.first_game_at ? new Date(day.first_game_at).getTime() : null;
  const windowOpen = !!day && !day.closed_at && first !== null && Date.now() >= first + 30 * 60000;
  let list = (reveal || []).map((r) => (/^taro tsujimoto$/i.test((r.player_name || '').trim()) ? { ...r, player_name: TARO, taro: true } : r));
  if (round && round.status !== 'terminee' && (list.length > 0 || windowOpen) && day && !day.closed_at) {
    const have = new Set(list.map((r) => r.display_name));
    const missing = rows.filter((r) => r.lives > 0 && !have.has(r.display_name))
      .map((r) => ({ display_name: r.display_name, player_name: TARO, doublon: false, outcome: 'aucun_choix', taro: true }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'));
    list = [...list, ...missing];
  }

  return (
    <main className="page">
      {rounds.length > 1 && (
        <div className="chips">
          {rounds.map((r) => <button key={r.id} className={'chip' + (r.id === roundId ? ' on' : '')} onClick={() => setRoundId(r.id)}>Ronde {r.number}<small>{r.status === 'terminee' ? 'terminée' : r.status === 'en_cours' ? 'en cours' : 'inscriptions'}</small></button>)}
        </div>
      )}
      {!round ? <div className="msg info">Aucune ronde pour l’instant.</div> : finished ? (
        <RoundSummary round={round} champ={champ} rows={rows} nbDays={nbDays} />
      ) : (
        <section className="panel stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Prédictions du jour</h2>
            {list.length > 0 && <span className={s.count} style={{ flex: 'none' }}>{list.length} participant{list.length > 1 ? 's' : ''}</span>}
          </div>
          {days.length > 0 && (
            <div className="chips">
              {days.map((d) => <button key={d.game_date} className={'chip' + (d.game_date === date ? ' on' : '')} onClick={() => setDate(d.game_date)}>{fmtShort(d.game_date)}</button>)}
            </div>
          )}
          {list.length === 0 ? (
            <div className="msg info">Les choix sont privés en ce moment. Ils apparaissent 30 minutes après le début du premier match, jusqu’à 60 minutes après la fermeture de la journée.</div>
          ) : (
            <div className={s.picks}>
              {list.map((r, i) => (
                <div className={s.pick + (r.taro ? ' ' + s.taro : '')} key={i}>
                  <span className={s.line} title={`${r.display_name} — ${r.player_name}`}>
                    <span className={s.who}>{r.display_name}</span><span className={s.sep}>—</span>{r.player_name}
                  </span>
                  <span className={s.tags}>
                    {r.doublon && <span className={s.tag + ' ' + s.dup}>Doublon</span>}
                    {r.outcome && OUTCOME[r.outcome] && !(r.doublon && r.outcome === 'doublon') && <span className={s.tag + ' ' + s[OUTCOME[r.outcome][1]]}>{OUTCOME[r.outcome][0]}</span>}
                  </span>
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
  return <AppShell><DailyPicks /></AppShell>;
}
