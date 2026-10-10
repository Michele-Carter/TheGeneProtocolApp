// Phone notifications for new orders, on the device the owner is using right now. The browser keeps a
// "subscription" (where the server sends alerts); public/sw.js shows them, even when the app is closed.

export type PushSubscriptionData = { endpoint: string; keys: { p256dh: string; auth: string } };

export const pushSupported = () =>
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// iPhones only allow notifications once the app has been added to the home screen.
export const needsHomeScreen = () =>
    /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !window.matchMedia?.("(display-mode: standalone)").matches &&
    !(navigator as unknown as { standalone?: boolean }).standalone;

// The key the server signs alerts with, in the form the browser wants.
function keyBytes(base64: string): Uint8Array {
    const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export async function currentSubscription(): Promise<PushSubscription | null> {
    if (!pushSupported()) return null;
    const registration = await navigator.serviceWorker.getRegistration("/");
    return (await registration?.pushManager.getSubscription()) ?? null;
}

// Asks for permission and subscribes this device. Throws a message the owner can act on if it can't.
export async function subscribeThisDevice(pushKey: string): Promise<PushSubscriptionData> {
    if (!pushSupported()) throw new Error("This browser can't show notifications. Try Chrome.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
        throw new Error(
            "Notifications are blocked for this site. Allow them in your browser's site settings (tap the icon next to the address), then try again."
        );
    }
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const registration = await navigator.serviceWorker.ready;
    const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) }));
    return subscription.toJSON() as PushSubscriptionData;
}

export async function unsubscribeThisDevice(): Promise<string | null> {
    const subscription = await currentSubscription();
    if (!subscription) return null;
    await subscription.unsubscribe();
    return subscription.endpoint;
}

// A friendly name for the list of devices, e.g. "Android phone (Chrome)".
export function thisDeviceName(): string {
    const ua = navigator.userAgent;
    const device = /Android/i.test(ua)
        ? /Mobile/i.test(ua)
            ? "Android phone"
            : "Android tablet"
        : /iPhone/i.test(ua)
          ? "iPhone"
          : /iPad/i.test(ua)
            ? "iPad"
            : /Windows/i.test(ua)
              ? "Windows computer"
              : /Mac/i.test(ua)
                ? "Mac"
                : "Computer";
    const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
    return browser ? `${device} (${browser})` : device;
}

// Where to look when alerts arrive but don't show - nearly always the device's own notification settings.
export function notificationTip(): string {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) {
        return "Not seeing them? On your phone, check Settings > Notifications > Chrome is allowed, and Do not disturb is off.";
    }
    if (/iPhone|iPad|iPod/i.test(ua)) {
        return "Not seeing them? Check Settings > Notifications > PepBiz is allowed, and Focus is off.";
    }
    if (/Windows/i.test(ua)) {
        return "Not seeing them? Make sure Windows notifications are turned on (Settings > System > Notifications), Google Chrome is allowed there, and Focus / Do not disturb is off.";
    }
    if (/Mac/i.test(ua)) {
        return "Not seeing them? Check System Settings > Notifications > Google Chrome is allowed, and Focus is off.";
    }
    return "Not seeing them? Check notifications are turned on for your browser in your device's settings.";
}
