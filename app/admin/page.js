'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import Participants from '@/components/admin/Participants';
import Rounds from '@/components/admin/Rounds';
import Schedule from '@/components/admin/Schedule';
import Players from '@/components/admin/Players';
import Points from '@/components/admin/Points';
import Audit from '@/components/admin/Audit';

const TABS = [
  ['participants', 'Participants', Participants],
  ['rondes', 'Rondes', Rounds],
  ['horaire', 'Horaire', Schedule],
  ['joueurs', 'Joueurs', Players],
  ['points', 'Points et vies', Points],
  ['journal', 'Journal', Audit],
];

function Admin() {
  const [tab, setTab] = useState('participants');
  const Current = TABS.find((t) => t[0] === tab)[2];
  return (
    <main className="page">
      <div>
        <div className="eyebrow">Gestionnaire</div>
        <h1>Gestion du pool</h1>
      </div>
      <div className="tabs chips">
        {TABS.map(([k, label]) => <button key={k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <Current />
    </main>
  );
}

export default function Page() {
  return <AppShell requireAdmin><Admin /></AppShell>;
}
