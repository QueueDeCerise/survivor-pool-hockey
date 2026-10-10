'use client';
import { useEffect } from 'react';

// Capte l'offre d'installation du navigateur dès l'ouverture du site,
// pour que le bouton du profil puisse l'utiliser plus tard.
export default function InstallCapture() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const onPrompt = (e) => {
      e.preventDefault();
      window.__sphInstall = e;
      window.dispatchEvent(new Event('sph-install-ready'));
    };
    const onInstalled = () => {
      window.__sphInstall = null;
      window.dispatchEvent(new Event('sph-installed'));
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return null;
}
