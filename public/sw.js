// New-order notifications for business owners (turned on in Admin -> Business, see src/lib/orderAlerts.ts).
// The browser runs this in the background, so the alert the server sends pops up even when the app is closed.
// Tapping it opens the app on the new orders.

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
      icon: data.icon || "/favicon.png",
      tag: data.tag,
      renotify: Boolean(data.tag),
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
