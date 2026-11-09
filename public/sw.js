// Service Worker THT - notifications push + mise a jour automatique
// (sans ca, une nouvelle version du code peut rester "en attente" indefiniment
// et l'app continue d'afficher l'ancienne version meme apres avoir vide le cache)

self.addEventListener('install', () => {
  // Ne pas attendre : cette nouvelle version se prepare tout de suite
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Prend le controle de toutes les pages ouvertes immediatement, sans attendre
  // qu'elles soient toutes fermees comme c'est le comportement par defaut
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// --- Cache des images et sons deja telecharges -------------------------------
// Photos de preuve, recus et messages vocaux sont stockes chez Supabase avec un nom
// de fichier horodate : une fois telecharge, un fichier ne change JAMAIS. On peut donc
// le garder en cache sans risque d'afficher une version perimee.
// Double economie : moins de bande passante facturee sur Supabase, et surtout beaucoup
// moins de donnees mobiles consommees par les utilisatrices (la data coute cher au Mali).
const CACHE_MEDIAS = 'tht-medias-v1';
const MAX_MEDIAS = 220; // garde-fou : evite de remplir le telephone

async function limiterCache(nom, maxEntrees) {
  const cache = await caches.open(nom);
  const cles = await cache.keys();
  // On supprime les plus anciennes entrees (ordre d'insertion)
  for (let i = 0; i < cles.length - maxEntrees; i++) await cache.delete(cles[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Uniquement les fichiers PUBLICS du stockage Supabase (jamais l'API, jamais l'auth :
  // ces reponses changent et ne doivent surtout pas etre servies depuis un cache).
  const estMediaSupabase = url.pathname.includes('/storage/v1/object/public/');
  if (!estMediaSupabase) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_MEDIAS);
    const enCache = await cache.match(req);
    if (enCache) return enCache; // deja telecharge : zero octet consomme
    try {
      const reponse = await fetch(req);
      // On ne met en cache que les reponses completes et valides
      if (reponse && reponse.status === 200 && reponse.type !== 'opaque') {
        await cache.put(req, reponse.clone());
        limiterCache(CACHE_MEDIAS, MAX_MEDIAS);
      }
      return reponse;
    } catch (e) {
      // Hors ligne et pas en cache : on laisse le navigateur gerer l'erreur
      return Response.error();
    }
  })());
});

self.addEventListener('push', (event) => {
  let data = { title: 'HABY Tontine', body: 'Nouvelle notification', url: '/' };
  try { data = { ...data, ...event.data.json() }; } catch (e) {}
  const options = {
    body: data.body || '',
    icon: '/icon-192-v2.png',
    badge: '/icon-192-v2.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(data.title || 'HABY Tontine', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if ('focus' in client) {
        client.postMessage({ type: 'NAVIGATE', url: targetUrl });
        return client.focus();
      }
    }
    return clients.openWindow(targetUrl);
  })());
});
