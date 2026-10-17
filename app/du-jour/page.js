'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Lives from '@/components/Lives';
import { supabase } from '@/lib/supabase';
import { todayLocal, fmtShort } from '@/lib/time';
import { TIMEZONE } from '@/lib/config';

const localDay = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
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

// Bilan d'une ronde terminée (bandeau du gagnant)
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

function PickList({ list }) {
  return (
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
  const [champsLoaded, setChampsLoaded] = useState(false);
  const [cache, setCache] = useState({}); // prédictions déjà chargées d'une ronde terminée, par date

  useEffect(() => {
    supabase.from('rounds').select('*').order('number', { ascending: false }).then(({ data }) => {
      setRounds(data || []);
      const active = (data || []).find((r) => r.status === 'en_cours') || (data || [])[0];
      if (active) setRoundId(active.id);
    });
    supabase.rpc('round_champions').then(({ data }) => { setChamps(data || []); setChampsLoaded(true); });
  }, []);

  const round = rounds.find((r) => r.id === roundId);
  const champ = champs.find((c) => c.round_id === roundId);
  const finished = !!round && round.status === 'terminee';

  useEffect(() => {
    if (!round || !champsLoaded) return;
    setReveal(null);
    supabase.rpc('standings', { p_round: round.id }).then(({ data }) => setRows(data || []));
    if (finished) {
      // Ronde terminée: les journées entre le début et le sacre où la ronde a au moins une prédiction.
      // (Les rondes peuvent se chevaucher: on ne se fie pas à la date de début de la ronde suivante.)
      const c = champs.find((x) => x.round_id === round.id);
      const end = c && c.finished_at ? localDay(c.finished_at) : todayLocal();
      setDays([]); setDate(null); setCache({});
      supabase.from('game_days').select('game_date, first_game_at, closed_at').gte('game_date', round.start_date).lte('game_date', end)
        .order('game_date', { ascending: true }).limit(200)
        .then(async ({ data }) => {
          const cand = data || [];
          const res = await Promise.all(cand.map((d) => supabase.rpc('revealed_picks', { p_round: round.id, p_date: d.game_date }).then(({ data: x }) => x || [])));
          const map = {};
          const list = cand.filter((d, i) => { if (res[i].length) { map[d.game_date] = res[i]; return true; } return false; });
          setCache(map);
          setDays(list);
          setDate(list.length ? list[list.length - 1].game_date : null);
        });
    } else {
      supabase.from('game_days').select('game_date, first_game_at, closed_at').gte('game_date', round.start_date).lte('game_date', todayLocal()).order('game_date', { ascending: false }).limit(60)
        .then(({ data }) => { setDays(data || []); setDate((data || [])[0] ? data[0].game_date : null); });
    }
  }, [roundId, champsLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!round || !date) { setReveal(null); return; }
    if (finished && cache[date]) { setReveal(cache[date]); return; }
    supabase.rpc('revealed_picks', { p_round: round.id, p_date: date }).then(({ data }) => setReveal(data || []));
  }, [date, roundId]); // eslint-disable-line

  const day = days.find((d) => d.game_date === date);
  let list = (reveal || []).map((r) => (/^taro tsujimoto$/i.test((r.player_name || '').trim()) ? { ...r, player_name: TARO, taro: true } : r));

  // Ronde en cours: survivants sans prédiction = TARO TSUJIMOTO (avant la fermeture de la journée)
  if (round && !finished && day && !day.closed_at) {
    const first = day.first_game_at ? new Date(day.first_game_at).getTime() : null;
    const windowOpen = first !== null && Date.now() >= first + 30 * 60000;
    if (list.length > 0 || windowOpen) {
      const have = new Set(list.map((r) => r.display_name));
      const missing = rows.filter((r) => r.lives > 0 && !have.has(r.display_name))
        .map((r) => ({ display_name: r.display_name, player_name: TARO, doublon: false, outcome: 'aucun_choix', taro: true }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'));
      list = [...list, ...missing];
    }
  }

  const dayNum = (d) => days.findIndex((x) => x.game_date === d) + 1;

  return (
    <main className="page">
      {rounds.length > 1 && (
        <div className="chips">
          {rounds.map((r) => <button key={r.id} className={'chip' + (r.id === roundId ? ' on' : '')} onClick={() => setRoundId(r.id)}>Ronde {r.number}<small>{r.status === 'terminee' ? 'terminée' : r.status === 'en_cours' ? 'en cours' : 'inscriptions'}</small></button>)}
        </div>
      )}
      {!round ? <div className="msg info">Aucune ronde pour l’instant.</div> : finished ? (
        <>
          <RoundSummary round={round} champ={champ} rows={rows} nbDays={days.length} />
          <section className="panel stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>Historique de la ronde</h2>
              {day && <span className={s.count} style={{ flex: 'none' }}>Jour {dayNum(date)} de {days.length}</span>}
            </div>
            {days.length > 0 && (
              <div className="chips">
                {days.map((d, i) => <button key={d.game_date} className={'chip' + (d.game_date === date ? ' on' : '')} onClick={() => setDate(d.game_date)}>{fmtShort(d.game_date)}<small>jour {i + 1}</small></button>)}
              </div>
            )}
            {days.length === 0 ? (
              <div className="msg info">Aucune journée enregistrée pour cette ronde.</div>
            ) : reveal === null ? (
              <div className="fine">Chargement…</div>
            ) : list.length === 0 ? (
              <div className="msg info">Aucune prédiction pour cette journée.</div>
            ) : (
              <PickList list={list} />
            )}
          </section>
        </>
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
            <PickList list={list} />
          )}
        </section>
      )}
    </main>
  );
}

export default function Page() {
  return <AppShell><DailyPicks /></AppShell>;
}
