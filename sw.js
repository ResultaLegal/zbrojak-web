// Service worker aplikácie ZBROJÁK.
// Cieľ: po prvom otvorení funguje aplikácia aj bez internetu — v aute, vo vlaku,
// v čakárni pred skúškou. Skripty a dáta sú na Supabase, shell na GitHub Pages,
// takže sa cachujú obe domény.

const VERSION = 'zbrojak-v6';
const B = 'https://wjgbffhasgwbqecfarst.supabase.co/storage/v1/object/public/zbrojak/';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

const ASSETS = [
  B + 'css/app.css',
  B + 'data/campaign.js',
  B + 'data/dilemmas.js',
  B + 'data/drills.js',
  B + 'data/facts.js',
  B + 'data/medic.js',
  B + 'data/pathway.js',
  B + 'data/patrol.js',
  B + 'data/q-a.js',
  B + 'data/q-b.js',
  B + 'data/q-c.js',
  B + 'data/q-d.js',
  B + 'data/q-e.js',
  B + 'data/questions.js',
  B + 'data/scenarios.js',
  B + 'data/weapons.js',
  B + 'js/anatomy.js',
  B + 'js/anatomy3d.js',
  B + 'js/answerbox.js',
  B + 'js/app.js',
  B + 'js/audio.js',
  B + 'js/games/dilemma.js',
  B + 'js/games/fieldstrip.js',
  B + 'js/games/medic.js',
  B + 'js/games/patrol.js',
  B + 'js/games/rangefire.js',
  B + 'js/games/sorter.js',
  B + 'js/games/vault.js',
  B + 'js/grade.js',
  B + 'js/search.js',
  B + 'js/srs.js',
  B + 'js/store.js',
  B + 'js/three/kit.js',
  B + 'js/three/pistol.js',
  B + 'js/three/revolver.js',
  B + 'js/three/rifle.js',
  B + 'js/three/viewer.js',
  B + 'js/ui.js',
  B + 'js/views/anatomyview.js',
  B + 'js/views/ask.js',
  B + 'js/views/bank.js',
  B + 'js/views/blitz.js',
  B + 'js/views/campaign.js',
  B + 'js/views/cards.js',
  B + 'js/views/common.js',
  B + 'js/views/exam.js',
  B + 'js/views/home.js',
  B + 'js/views/law.js',
  B + 'js/views/path.js',
  B + 'js/views/profile.js',
  B + 'js/views/range.js',
  B + 'js/views/scenario.js',
  B + 'js/views/stats.js',
  B + 'js/views/triage.js',
  B + 'js/weapon.js'
];

// Veľké súbory — model zbrane, znenia zákonov, rubriky a vysvetľovač.
// Sťahujú sa až po inštalácii, aby prvé otvorenie nečakalo na dva megabajty.
const HEAVY = [
  B + 'data/explain.js',
  B + 'data/law.js',
  B + 'data/rubrics.js',
  B + 'js/vendor/three.module.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // cache: 'reload' obchádza HTTP cache prehliadača — inak by sa do offline zásoby
    // dostala stará verzia vstupnej stránky
    const fresh = u => new Request(u, { cache: 'reload' });
    await Promise.all(SHELL.map(u => c.add(fresh(u)).catch(() => {})));
    await Promise.all(ASSETS.map(u => c.add(fresh(u)).catch(() => {})));
    // ťažké súbory dobehnú na pozadí; appka je použiteľná aj bez nich
    Promise.all(HEAVY.map(u => c.add(fresh(u)).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ours = url.origin === self.location.origin || req.url.startsWith(B);
  if (!ours) return;

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);

    // Vstupná stránka: najprv sieť, aby sa aktualizácia prejavila hneď;
    // bez siete padáme na uloženú kópiu, takže appka naštartuje aj offline.
    if (req.mode === 'navigate') {
      try {
        const r = await fetch(new Request(req.url, { cache: 'reload' }));
        if (r && r.ok) { cache.put('./index.html', r.clone()); cache.put('./', r.clone()); }
        return r;
      } catch (err) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    }

    // Skripty, štýly a dáta: najprv cache (appka naskočí okamžite), obnova na pozadí.
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) {
      fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); }).catch(() => {});
      return hit;
    }
    const r = await fetch(req);
    if (r && r.ok) cache.put(req, r.clone());
    return r;
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
