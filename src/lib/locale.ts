import { countryInfo, type CountryInfo } from "../../shared/countries";

// The country, currency and time zone of the business the app is being used as (shared/countries.ts), for
// writing money and dates the way that business does. Set by useBusiness as soon as the business is known,
// before any of its screens show; New Zealand until then.

let current = { country: "NZ", currency: "NZD", timeZone: "Pacific/Auckland" };

export function setBusinessLocale(settings: { country: string; currency: string; timeZone: string }) {
  current = { country: settings.country, currency: settings.currency, timeZone: settings.timeZone };
}

export const homeCountry = (): CountryInfo => countryInfo(current.country);
export const homeCurrency = () => current.currency;
export const businessTimeZone = () => current.timeZone;
// How the business writes dates and numbers, e.g. "en-NZ" (16/10/2026) or "en-US" (10/16/2026).
export const appLocale = () => homeCountry().locale;

// A date or time in the business's way of writing it.
export function formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  // A plain yyyy-mm-dd is a calendar day: shown as that day wherever the viewer is.
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString(appLocale(), options);
}

export function formatDateTime(value: string | Date, options: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleString(appLocale(), options);
}

// Today's date (yyyy-mm-dd) where the business is.
export function businessToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: current.timeZone });
}

// The calendar day (yyyy-mm-dd) a moment falls on where the business is.
export function businessDay(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: current.timeZone });
}
