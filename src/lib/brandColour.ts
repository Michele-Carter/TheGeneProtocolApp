// A business's own colour in place of the app's gold. The app's gold is a set of CSS variables
// (--color-gold-200 ... -950, index.css), so a business colour is applied by working out the same set of shades
// from it and setting those variables on the page. Text on solid colour (--gold-ink) switches between near-black
// and white, whichever reads better. PepBiz's own pages (front page, registration) always use gold.

export const PEPBIZ_GOLD = "#c2911f";

// Quick picks on the Business page (any colour can be chosen too).
export const BRAND_PRESETS: { name: string; hex: string }[] = [
    { name: "Gold", hex: PEPBIZ_GOLD },
    { name: "Pink", hex: "#e0457b" },
    { name: "Purple", hex: "#8b5cf6" },
    { name: "Blue", hex: "#3b82f6" },
    { name: "Teal", hex: "#14b8a6" },
    { name: "Green", hex: "#22c55e" },
    { name: "Orange", hex: "#f97316" },
    { name: "Red", hex: "#ef4444" },
];

const SHADES = ["200", "300", "400", "500", "600", "700", "900", "950"] as const;
type Shades = Record<(typeof SHADES)[number], string>;

export const isHexColour = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

function toHsl(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l * 100];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s * 100, l * 100];
}

function toHex(h: number, s: number, l: number): string {
    const sat = s / 100;
    const light = Math.min(100, Math.max(0, l)) / 100;
    const a = sat * Math.min(light, 1 - light);
    const f = (k: number) => {
        const x = (k + h / 30) % 12;
        return Math.round(255 * (light - a * Math.max(-1, Math.min(x - 3, 9 - x, 1))));
    };
    return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// The shades the app uses, from one colour (as the 500). The lighter ones never go below a lightness that reads
// on the dark background, as they're used for text; the 500 stays the exact colour chosen.
export function brandShades(hex: string): Shades {
    const [h, s, l] = toHsl(hex);
    const at = (lightness: number) => toHex(h, s, Math.min(94, Math.max(5, lightness)));
    return {
        "200": at(Math.max(l + 30, 76)),
        "300": at(Math.max(l + 19, 66)),
        "400": at(Math.max(l + 9, 56)),
        "500": hex.toLowerCase(),
        "600": at(l - 8),
        "700": at(l - 16),
        "900": at(Math.min(l - 31, 16)),
        "950": at(Math.min(l - 36, 10)),
    };
}

// WCAG relative luminance and contrast ratio.
function luminance(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}

const INK_DARK = "#0b0b0c";
const INK_LIGHT = "#ffffff";
// Text on a solid button of this colour.
export const inkOn = (hex: string) => (contrast(hex, INK_DARK) >= contrast(hex, INK_LIGHT) ? INK_DARK : INK_LIGHT);

// A problem with a colour, if any: too dark to stand out on the app's dark background.
export function colourWarning(hex: string): string | null {
    if (!isHexColour(hex)) return null;
    if (contrast(hex, "#18181b") < 2.2) {
        return "This colour is very dark, so buttons and highlights won't stand out on the dark background. A brighter shade will look better.";
    }
    return null;
}

// Sets the page's colours to a business's (or back to PepBiz gold for "" / null).
export function applyBrandColour(hex: string | null | undefined) {
    const root = document.documentElement.style;
    if (!hex || !isHexColour(hex) || hex.toLowerCase() === PEPBIZ_GOLD) {
        for (const shade of SHADES) root.removeProperty(`--color-gold-${shade}`);
        root.removeProperty("--gold-ink");
        return;
    }
    const shades = brandShades(hex);
    for (const shade of SHADES) root.setProperty(`--color-gold-${shade}`, shades[shade]);
    root.setProperty("--gold-ink", inkOn(hex));
}
