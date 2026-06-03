const CACHE = "origami-v13";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        "./",
        "./index.html",
        "./shared/styles.css",
        "./shared/tool-ui.css",
        "./shared/shell.js",
        "./shared/vendor/pdf-lib.min.js",
        "./shared/vendor/jszip.min.js",
        "./shared/vendor/qr-code-styling.js",
        "./shared/vendor/heic2any.min.js",
        "./shared/vendor/pdfjs/pdf.min.js",
        "./shared/vendor/pdfjs/pdf.worker.min.js",
        "./tools/pic2pdf/",
        "./tools/pic2pdf/index.html",
        "./tools/pic2pdf/styles.css",
        "./tools/pic2pdf/app.js",
        "./tools/merge-pdf/",
        "./tools/merge-pdf/index.html",
        "./tools/merge-pdf/styles.css",
        "./tools/merge-pdf/app.js",
        "./tools/pdf2pic/",
        "./tools/pdf2pic/index.html",
        "./tools/pdf2pic/styles.css",
        "./tools/pdf2pic/app.js",
        "./tools/compress-image/",
        "./tools/compress-image/index.html",
        "./tools/compress-image/styles.css",
        "./tools/compress-image/app.js",
        "./tools/qr/",
        "./tools/qr/index.html",
        "./tools/qr/styles.css",
        "./tools/qr/app.js",
        "./tools/convert-image/",
        "./tools/convert-image/index.html",
        "./tools/convert-image/styles.css",
        "./tools/convert-image/app.js",
        "./tools/split-pdf/",
        "./tools/split-pdf/index.html",
        "./tools/split-pdf/styles.css",
        "./tools/split-pdf/app.js",
        "./tools/favicon/",
        "./tools/favicon/index.html",
        "./tools/favicon/styles.css",
        "./tools/favicon/app.js",
        "./tools/crop-image/",
        "./tools/crop-image/index.html",
        "./tools/crop-image/styles.css",
        "./tools/crop-image/app.js",
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
