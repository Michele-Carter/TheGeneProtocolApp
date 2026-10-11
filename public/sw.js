// Phone/computer notifications (src/lib/orderAlerts.ts): new-order alerts for business owners, order updates
// for customers. The browser runs this in the background, so they pop up even when the app is closed.
// Tapping one opens the app where it points (new orders, or the customer's orders).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "New order", {
      body: data.body || "",
      // The shop's logo (customers' notifications never fall back to the PepBiz badge).
      ...(data.icon ? { icon: data.icon } : {}),
      tag: data.tag,
      renotify: Boolean(data.tag),
      // On a computer it stays on screen until clicked or closed (phones keep it in the notification list anyway).
      requireInteraction: true,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const win of windows) {
        if (new URL(win.url).origin !== self.location.origin) continue;
        try {
          await win.navigate(url);
          return win.focus();
        } catch {
          break; // a window this script doesn't control can't be moved - open a new one instead
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});
