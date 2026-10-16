import { currentBusiness } from "./business.js";

// Calendar days where the business is (its time zone, set at sign-up), so a date the owner picks is stored and
// shown as that day for them - wherever the server runs.

const businessZone = () => currentBusiness()?.timeZone ?? "Pacific/Auckland";

// Midday on a yyyy-mm-dd in a time zone: safely inside that day however the date is later shown.
export function middayIn(date: string, timeZone: string): Date {
    const guess = new Date(`${date}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).formatToParts(guess);
    const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const zoneClock = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
    return new Date(guess.getTime() - (zoneClock - guess.getTime()));
}

// A picked date as a moment (midday that day where the business is), or now if none.
export function businessDate(date?: string): Date {
    return date ? middayIn(date, businessZone()) : new Date();
}

// The yyyy-mm-dd a moment falls on where the business is.
export function businessDateString(date: Date): string {
    return date.toLocaleDateString("en-CA", { timeZone: businessZone() });
}
