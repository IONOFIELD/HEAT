/* HEAT offline support.
   App files: try the network first so updates land right away, fall back to the saved copy with no signal.
   Map tiles, fonts and the map style: use the saved copy instantly and refresh it in the background.
   Search, store finder and version checks always go to the network. */
const SHELL = "heat-shell-v1", MAP = "heat-map-v1", MAP_MAX = 4000;
const CORE = ["./", "index.html", "styles.css", "app.js", "zones.js", "retailers.js", "earth.js", "unicorn.js", "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png",
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js", "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== MAP).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const isMap = u => /(^|\.)openfreemap\.org$/.test(u.hostname) || u.hostname === "basemaps.cartocdn.com";
const isLive = u => u.pathname.endsWith("version.json") || /photon|overpass|nominatim|weedmaps/.test(u.hostname);
const isShell = u => u.origin === self.location.origin || u.hostname === "unpkg.com" || u.hostname === "cdnjs.cloudflare.com" || u.hostname === "raw.githubusercontent.com";

let trimming = false;
async function trimMap() {
  if (trimming) return; trimming = true;
  try { const c = await caches.open(MAP), ks = await c.keys(); for (let i = 0; i < ks.length - MAP_MAX; i++) await c.delete(ks[i]); } catch {}
  trimming = false;
}

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (isLive(u)) return;                                   // always live
  if (isMap(u) && !/\.pbf$|\/fonts\/|\/sprites\//.test(u.pathname)) {   // map style and tile index: fresh first, saved copy with no signal
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(MAP).then(c => c.put(req, cp)); } return r; }).catch(() => caches.match(req)));
    return;
  }
  if (isMap(u)) {                                          // tiles, fonts, icons: saved copy first, refresh behind it
    e.respondWith(caches.open(MAP).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok) { c.put(req, r.clone()); trimMap(); } return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (isShell(u) || req.mode === "navigate") {             // network first, saved copy with no signal
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(SHELL).then(c => c.put(req, cp)); } return r; })
      .catch(async () => (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? caches.match("index.html", { ignoreSearch: true }) : Response.error())));
  }
});
