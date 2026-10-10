'use client';
import { useEffect, useState } from 'react';

function detect() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const safariMac = !ios && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);
  const firefox = /Firefox|FxiOS/.test(ua);
  return { ios, android, standalone, safariMac, firefox, mobile: ios || android };
}

// Ajout de l'application à l'écran d'accueil (cellulaire) ou au bureau (ordinateur)
export default function InstallApp() {
  const [env, setEnv] = useState(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setEnv(detect());
    setCanPrompt(!!window.__sphInstall);
    const ready = () => setCanPrompt(true);
    const installed = () => { setDone(true); setCanPrompt(false); };
    window.addEventListener('sph-install-ready', ready);
    window.addEventListener('sph-installed', installed);
    return () => { window.removeEventListener('sph-install-ready', ready); window.removeEventListener('sph-installed', installed); };
  }, []);

  async function install() {
    const p = window.__sphInstall;
    if (!p) return;
    p.prompt();
    const choice = await p.userChoice;
    if (choice && choice.outcome === 'accepted') setDone(true);
    window.__sphInstall = null;
    setCanPrompt(false);
  }

  if (!env) return null;

  const where = env.mobile ? 'sur ton écran d’accueil' : 'sur ton ordinateur';

  return (
    <section className="panel stack">
      <h2>Raccourci de l’application</h2>
      {env.standalone || done ? (
        <div className="msg ok">L’application est installée {where}. ✓</div>
      ) : canPrompt ? (
        <>
          <p className="fine" style={{ margin: 0 }}>Ajoute Survivor Pool Hockey {where}, avec son écusson, pour l’ouvrir en un seul geste.</p>
          <button className="btn" onClick={install}>Installer l’application</button>
        </>
      ) : env.ios ? (
        <ol className="fine" style={{ margin: 0, paddingLeft: 20 }}>
          <li>Ouvre ce site dans <b>Safari</b>.</li>
          <li>Touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</li>
          <li>Choisis <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li>
        </ol>
      ) : env.android ? (
        <ol className="fine" style={{ margin: 0, paddingLeft: 20 }}>
          <li>Touche le menu <b>⋮</b> en haut à droite du navigateur.</li>
          <li>Choisis <b>Ajouter à l’écran d’accueil</b> ou <b>Installer l’application</b>.</li>
        </ol>
      ) : env.safariMac ? (
        <p className="fine" style={{ margin: 0 }}>Dans Safari, ouvre le menu <b>Fichier</b> puis choisis <b>Ajouter au Dock</b>.</p>
      ) : env.firefox ? (
        <p className="fine" style={{ margin: 0 }}>Firefox ne permet pas l’installation. Ajoute la page à tes favoris avec <b>Ctrl+D</b> (ou <b>Cmd+D</b> sur Mac), ou ouvre le site dans Chrome ou Edge pour l’installer.</p>
      ) : (
        <p className="fine" style={{ margin: 0 }}>Clique l’icône d’installation <b>⊕</b> à droite de la barre d’adresse, ou ouvre le menu du navigateur et choisis <b>Installer Survivor Pool Hockey</b>.</p>
      )}
    </section>
  );
}
