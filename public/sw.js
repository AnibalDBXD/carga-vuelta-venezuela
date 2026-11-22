// Service worker mínimo para notificaciones push de CargaRuta.
// El listener fetch vacío hace que el SW cumpla los criterios de instalación PWA;
// las peticiones siguen yendo directo a la red.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* cuerpo vacío o no-JSON */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "CargaRuta", {
      body: data.body || "",
      icon: "/favicon.ico",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(clients.openWindow(url));
});
