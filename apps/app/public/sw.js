// public/sw.js
self.addEventListener("install", () => {
  console.log("Service Worker de CotizaAI instalado.");
});

// Chrome exige que exista el evento 'fetch' para habilitar el botón de instalar.
self.addEventListener("fetch", () => {
  // No hacemos nada especial, dejamos que la web funcione normal.
});
