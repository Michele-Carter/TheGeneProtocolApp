// The browser tab's name and icon. index.html starts neutral ("Welcome", no icon) so a customer never sees
// PepBiz - pages then set the shop's name and logo, or PepBiz for business owners.

export const PEPBIZ_ICON = "/favicon.png";

export function setTabBranding(title: string, iconUrl: string | null) {
    document.title = title;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
    }
    link.removeAttribute("type"); // shop logos can be any image type
    link.href = iconUrl ?? "data:,"; // "data:," = no icon, so the browser doesn't show a default one
}
