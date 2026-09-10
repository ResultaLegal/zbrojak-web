// Service worker aplikácie ZBROJÁK.
// Cieľ: po prvom otvorení funguje aplikácia aj bez internetu — v aute, vo vlaku,
// v čakárni pred skúškou. Skripty a dáta sú na Supabase, shell na GitHub Pages,
// takže sa cachujú obe domény.

const VERSION = 'zbrojak-daf4c75b';
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
  B + 'dist/app.js',
];

// Veľké súbory — model zbrane, znenia zákonov, rubriky a vysvetľovač.
// Sťahujú sa až po inštalácii, aby prvé otvorenie nečakalo na dva megabajty.
const HEAVY = [
];

/**
 * Zásoba sa naberá po dávkach, nie naraz.
 *
 * Aplikácia je rozdelená na stovky malých modulov — to je zámer, lebo sa tak
 * dá meniť jedna vec bez dotyku ostatných. Úložisko však odmietne stovky
 * súčasných požiadaviek (HTTP 429), preto sa sťahuje po skupinách a pri
 * odmietnutí sa počká a skúsi znova.
 */
const BATCH = 6;
const PAUSE = 90;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function take(cache, url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(new Request(url, { cache: 'reload' }));
      if (r && r.ok) { await cache.put(url, r.clone()); return true; }
      if (r && r.status === 429) { await sleep(400 * (i + 1)); continue; }
      return false;
    } catch {
      await sleep(200 * (i + 1));
    }
  }
  return false;
}

async function fill(cache, list, { batch = BATCH, pause = PAUSE } = {}) {
  for (let i = 0; i < list.length; i += batch) {
    await Promise.all(list.slice(i, i + batch).map(u => take(cache, u)));
    if (pause) await sleep(pause);
  }
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await fill(c, SHELL, { batch: 3, pause: 0 });
    await fill(c, ASSETS);
    // ťažké súbory dobehnú na pozadí, pomalšie; appka je použiteľná aj bez nich
    fill(c, HEAVY, { batch: 4, pause: 260 });
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
