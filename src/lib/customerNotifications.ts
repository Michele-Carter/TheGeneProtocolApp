import { shopApi } from "./shopApi";
import {
    currentSubscription,
    needsHomeScreen,
    pushSupported,
    subscribeThisDevice,
    thisDeviceName,
    unsubscribeThisDevice,
} from "./orderAlerts";

// A customer's own order updates on their phone/computer (confirmed, declined, paid...). Browsers only allow
// notifications once the person taps Allow, so customers are asked once, when they send an order; after that
// they're on - and come back on by themselves on a device that already allows them - unless they turn them off.

type GetToken = () => Promise<string | null>;

const OFF_KEY = "peppal.notificationsOff.v1"; // this device: the customer turned them off - don't turn them back on

function turnedOff(): boolean {
    try {
        return window.localStorage.getItem(OFF_KEY) === "1";
    } catch {
        return false;
    }
}
function rememberOff(off: boolean) {
    try {
        if (off) window.localStorage.setItem(OFF_KEY, "1");
        else window.localStorage.removeItem(OFF_KEY);
    } catch {
        // Only means a device the customer turned off may switch itself back on.
    }
}

export type NotificationState = "unsupported" | "not-set-up" | "needs-home-screen" | "blocked" | "on" | "off";

export async function customerNotificationState(getToken: GetToken): Promise<NotificationState> {
    if (!pushSupported()) return "unsupported";
    if (needsHomeScreen()) return "needs-home-screen";
    const info = await shopApi.pushInfo(getToken);
    if (!info.pushKey) return "not-set-up";
    if (Notification.permission === "denied") return "blocked";
    const subscription = await currentSubscription();
    return subscription && info.endpoints.includes(subscription.endpoint) ? "on" : "off";
}

// Makes sure this device gets notifications, without asking - only when the browser already allows them and the
// customer hasn't turned them off. Run when the app opens.
export async function keepCustomerNotificationsOn(getToken: GetToken): Promise<void> {
    if (!pushSupported() || turnedOff() || Notification.permission !== "granted") return;
    const info = await shopApi.pushInfo(getToken);
    if (!info.pushKey) return;
    const subscription = await subscribeThisDevice(info.pushKey);
    if (!info.endpoints.includes(subscription.endpoint)) {
        await shopApi.subscribePush(subscription, thisDeviceName(), getToken);
    }
}

// Call first thing in the Send order click: the browser only shows its "Allow notifications?" question in
// response to a tap. Never throws or holds up the order.
export function askForCustomerNotifications(getToken: GetToken): void {
    if (!pushSupported() || needsHomeScreen() || turnedOff()) return;
    const turnOn = () => keepCustomerNotificationsOn(getToken).catch(() => {});
    if (Notification.permission === "granted") {
        void turnOn();
    } else if (Notification.permission === "default") {
        void Notification.requestPermission()
            .then((answer) => (answer === "granted" ? turnOn() : undefined))
            .catch(() => {});
    }
}

export async function turnOnCustomerNotifications(getToken: GetToken): Promise<void> {
    rememberOff(false);
    const info = await shopApi.pushInfo(getToken);
    if (!info.pushKey) throw new Error("Notifications aren't available right now.");
    const subscription = await subscribeThisDevice(info.pushKey);
    await shopApi.subscribePush(subscription, thisDeviceName(), getToken);
}

export async function turnOffCustomerNotifications(getToken: GetToken): Promise<void> {
    rememberOff(true);
    const endpoint = await unsubscribeThisDevice();
    if (endpoint) await shopApi.unsubscribePush(endpoint, getToken);
}
