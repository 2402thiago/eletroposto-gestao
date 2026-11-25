const CACHE = "eletroposto-v8";
// Os demais módulos da Análise (analise/**) entram no cache na primeira vez que são usados.
const ARQUIVOS = ["./", "./index.html", "./styles.css", "./core.js", "./demo.js", "./app.js", "./analise-entrada.js", "./analise/analise.css", "./analise/vendor/leaflet/leaflet.css", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(ARQUIVOS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(function () { return caches.match("./index.html"); })
    );
    return;
  }
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (!res.ok) return res;
      const copia = res.clone();
      e.waitUntil(caches.open(CACHE).then(function (c) { return c.put(e.request, copia); }));
      return res;
    }).catch(function () {
      return caches.match(e.request);
    })
  );
});
