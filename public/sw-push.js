/* Web Push handlers imported into the generated service worker (workbox importScripts).
   Delivery requires the server-side VAPID push sender to be configured — see README. */
self.addEventListener("push", (event) => {
  let data = { title: "MBS Staff", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    data.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
