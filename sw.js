// Service worker aplikácie ZBROJÁK.
// Cieľ: po prvom otvorení funguje aplikácia aj bez internetu — v aute, vo vlaku,
// v čakárni pred skúškou. Skripty a dáta sú na Supabase, shell na GitHub Pages,
// takže sa cachujú obe domény.

const VERSION = 'zbrojak-9a8e11c5';
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
  B + 'dist/parts/features-anatomyview.871a74a6.js',
  B + 'dist/parts/features-ask.44dfe361.js',
  B + 'dist/parts/features-bank.810c7ef5.js',
  B + 'dist/parts/features-blitz.f8fec24a.js',
  B + 'dist/parts/features-campaign.db4b319f.js',
  B + 'dist/parts/features-cards.313e2984.js',
  B + 'dist/parts/features-exam.8cff785c.js',
  B + 'dist/parts/features-home.6e3fcbf0.js',
  B + 'dist/parts/features-law.2932d8bf.js',
  B + 'dist/parts/features-path.2e0c283f.js',
  B + 'dist/parts/features-profile.931ea87a.js',
  B + 'dist/parts/features-range.9bc0f42c.js',
  B + 'dist/parts/features-stats.9064f6e7.js',
  B + 'dist/parts/features-triage.ce5ce94b.js',
  B + 'dist/parts/games-dilemma.372037e7.js',
  B + 'dist/parts/games-fieldstrip.8fc9bbce.js',
  B + 'dist/parts/games-medic.b88c96a4.js',
  B + 'dist/parts/games-patrol.7384e81a.js',
  B + 'dist/parts/games-rangefire.3d379fc1.js',
  B + 'dist/parts/games-sorter.892eeaf6.js',
  B + 'dist/parts/games-vault.b9515af0.js',
  B + 'dist/parts/spolu-content-campaign.88baa74c.js',
  B + 'dist/parts/spolu-content-law.12b2058a.js',
  B + 'dist/parts/spolu-content-questions.facb96ad.js',
  B + 'dist/parts/spolu-content-rubrics.f8c9c4ec.js',
  B + 'dist/parts/spolu-features-simulator.87e8f711.js',
  B + 'dist/parts/spolu-vendor-three-module.467cc586.js',
  B + 'dist/parts/spolu-weapon-3d-core.4f4ef5ee.js',
  B + 'dist/parts/spolu-weapon-3d-panel.fcda44cc.js',
  B + 'dist/parts/spolu-weapon-3d.d12d4771.js',
  B + 'dist/parts/weapon-3d-mesh-skin.ccc46cb0.js',
  B + 'dist/parts/weapon-3d-models-auto.84ebad45.js',
  B + 'dist/parts/weapon-3d-models-pistol.41ce97fd.js',
  B + 'dist/parts/weapon-3d-models-revolver.bd98ded2.js',
  B + 'dist/parts/weapon-3d-models-rifle.3324f310.js',
  B + 'dist/parts/weapon-3d-models-shotgun.bc3e1ccb.js',
  B + 'dist/parts/weapon-svg-schema.ed5cf54a.js',
];

// 3D modely zbraní — dvadsať megabajtov. Sťahujú sa až po inštalácii a pomaly;
// zoznam prepisuje tools/gen_sw.py, tento komentár nie, tak nech hovorí pravdu:
// zákony, rubriky ani vysvetľovač tu nie sú, tie sú medzi ASSETS.
const HEAVY = [
  B + 'dist/models/357_python_revolver_riggedgame_ready.glb',
  B + 'dist/models/classic_m4.glb',
  B + 'dist/models/g19_pistol_game_ready_free_version.glb',
  B + 'dist/models/mauser_98_sporting.glb',
  B + 'dist/models/remington_870_shotgun.glb',
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

/** Šetrí používateľ dáta, alebo je na pomalej sieti? */
function setrneData() {
  const c = self.navigator && self.navigator.connection;
  if (!c) return false;
  return !!c.saveData || c.effectiveType === '2g' || c.effectiveType === 'slow-2g';
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await fill(c, SHELL, { batch: 3, pause: 0 });
    await fill(c, ASSETS);
    // Ťažké súbory (3D modely, dvadsať megabajtov) dobehnú na pozadí a pomaly;
    // appka je použiteľná aj bez nich — zbraň je dovtedy kreslená kódom.
    // Na meranom alebo pomalom pripojení sa nesťahujú vôbec: nikto nechce prísť
    // o dáta za niečo, čo si nevypýtal. Kto Anatómiu naozaj otvorí, model si
    // stiahne sám a service worker si ho pri tom uloží.
    if (!setrneData()) fill(c, HEAVY, { batch: 4, pause: 260 });
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
