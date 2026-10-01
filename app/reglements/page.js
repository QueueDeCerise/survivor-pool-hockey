'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase, frError } from '@/lib/supabase';
import { RULES } from '@/lib/rules';
import { RULES_VERSION } from '@/lib/config';
import { fmtDateTime } from '@/lib/time';

function Rules({ ctx }) {
  const router = useRouter();
  const box = useRef(null);
  const [read, setRead] = useState(!!ctx.acceptance);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');

  function onScroll() {
    const el = box.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 12) setRead(true);
  }

  async function accept() {
    setError('');
    const { error } = await supabase.from('rule_acceptances').insert({ user_id: ctx.user.id, version: RULES_VERSION });
    if (error && !/duplicate/i.test(error.message)) return setError(frError(error));
    router.replace('/predictions');
  }

  return (
    <main className="page">
      <div>
        <div className="eyebrow">Règlements officiels · {RULES_VERSION}</div>
        <h1>{ctx.acceptance ? 'Les règles du pool' : 'Les règles avant ton premier choix'}</h1>
      </div>
      <div className="rules-scroll" ref={box} onScroll={onScroll}>
        {RULES.map((r) => (
          <section key={r.title}><h3>{r.title}</h3><p>{r.text}</p></section>
        ))}
      </div>
      {ctx.acceptance ? (
        <div className="msg ok">Acceptés le {fmtDateTime(ctx.acceptance.accepted_at)}.</div>
      ) : (
        <div className="stack">
          {!read && <div className="fine">Fais défiler jusqu’à la fin pour continuer.</div>}
          <label className="check">
            <input type="checkbox" disabled={!read} checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span><b>J’ai lu et j’accepte les règlements officiels.</b></span>
          </label>
          {error && <div className="msg err">{error}</div>}
          <button className="btn" disabled={!checked} onClick={accept}>Accepter et continuer</button>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return <AppShell allowWithoutRules>{(ctx) => <Rules ctx={ctx} />}</AppShell>;
}
