// The browser tab's name and icon, and what the app is called if someone adds it to their home screen.
// index.html starts neutral ("Welcome", no icon) so a customer never sees PepBiz - pages then set the shop's
// name and logo, or PepBiz for business owners.

export const PEPBIZ_ICON = "/favicon.png";

function headTag<T extends HTMLElement>(selector: string, create: () => T): T {
    let el = document.head.querySelector<T>(selector);
    if (!el) {
        el = create();
        document.head.appendChild(el);
    }
    return el;
}

const link = (rel: string) =>
    headTag(`link[rel="${rel}"]`, () => {
        const el = document.createElement("link");
        el.rel = rel;
        return el;
    });

// slug: the shop's link, so a home-screen icon opens that shop (iPhones only allow notifications for an app
// added to the home screen). Leave it out for PepBiz itself.
export function setTabBranding(title: string, iconUrl: string | null, slug?: string | null) {
    document.title = title;
    const icon = link("icon");
    icon.removeAttribute("type"); // shop logos can be any image type
    icon.href = iconUrl ?? "data:,"; // "data:," = no icon, so the browser doesn't show a default one

    link("manifest").href = `/api/business/manifest${slug ? `?slug=${encodeURIComponent(slug)}` : ""}`;
    const touchIcon = link("apple-touch-icon");
    if (iconUrl) touchIcon.href = iconUrl;
    else touchIcon.remove();
    headTag('meta[name="apple-mobile-web-app-title"]', () => {
        const el = document.createElement("meta");
        el.name = "apple-mobile-web-app-title";
        return el;
    }).content = title;
}
