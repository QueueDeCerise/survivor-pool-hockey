// Service minimal: permet d'installer l'application. Aucune donnée n'est mise en cache,
// pour que les choix et le classement soient toujours à jour.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
