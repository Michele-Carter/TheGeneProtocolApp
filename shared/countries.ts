// The countries a business can be in. A business's country is chosen at sign-up and sets its currency (fixed
// once its subscription starts, so its sales history stays in one currency), how dates and money are written,
// its default time zone, and how its customers' addresses and its bank details are asked for.
// To add a country: add it here (and its currency to MONEY_PREFIX if it's new).

export interface CountryInfo {
  code: string; // ISO code, stored on the business
  name: string; // also the default country on customers' addresses
  currency: string; // ISO currency code
  locale: string; // how dates and numbers are written
  timeZones: { id: string; label: string }[]; // the first is the default
  address: {
    line2: string;
    suburb: string | null; // null = not asked
    city: string;
    region: string | null; // state / province / county; null = not asked
    regionOptional?: boolean;
    postcode: string;
  };
  bank: {
    bankPlaceholder: string;
    accountLabel: string; // on the owner's Payment details page
    accountPlaceholder: string;
    accountHint: string;
    payToLabel: string; // what customers see it as on their order
  };
  couriers: string[];
}

export const COUNTRIES: CountryInfo[] = [
  {
    code: "NZ",
    name: "New Zealand",
    currency: "NZD",
    locale: "en-NZ",
    timeZones: [{ id: "Pacific/Auckland", label: "New Zealand" }],
    address: { line2: "Apartment, unit or RD (optional)", suburb: "Suburb", city: "Town / city", region: null, postcode: "Postcode" },
    bank: {
      bankPlaceholder: "e.g. ANZ",
      accountLabel: "Account number",
      accountPlaceholder: "12-3456-7890123-00",
      accountHint: "e.g. 12-3456-7890123-00 - spaces or dashes are fine.",
      payToLabel: "Account number",
    },
    couriers: ["NZ Post", "CourierPost", "Aramex", "NZ Couriers", "Pickup"],
  },
  {
    code: "AU",
    name: "Australia",
    currency: "AUD",
    locale: "en-AU",
    timeZones: [
      { id: "Australia/Sydney", label: "Sydney, Melbourne, Canberra" },
      { id: "Australia/Brisbane", label: "Brisbane" },
      { id: "Australia/Adelaide", label: "Adelaide" },
      { id: "Australia/Darwin", label: "Darwin" },
      { id: "Australia/Perth", label: "Perth" },
      { id: "Australia/Hobart", label: "Hobart" },
    ],
    address: { line2: "Apartment, unit or suite (optional)", suburb: null, city: "Suburb / town", region: "State", postcode: "Postcode" },
    bank: {
      bankPlaceholder: "e.g. Commonwealth Bank",
      accountLabel: "BSB and account number",
      accountPlaceholder: "BSB 062-000, account 1234 5678",
      accountHint: "Your BSB and account number, or a PayID.",
      payToLabel: "Pay to",
    },
    couriers: ["Australia Post", "StarTrack", "Aramex", "Sendle", "Pickup"],
  },
  {
    code: "US",
    name: "United States",
    currency: "USD",
    locale: "en-US",
    timeZones: [
      { id: "America/New_York", label: "Eastern" },
      { id: "America/Chicago", label: "Central" },
      { id: "America/Denver", label: "Mountain" },
      { id: "America/Phoenix", label: "Arizona" },
      { id: "America/Los_Angeles", label: "Pacific" },
      { id: "America/Anchorage", label: "Alaska" },
      { id: "Pacific/Honolulu", label: "Hawaii" },
    ],
    address: { line2: "Apartment, suite or unit (optional)", suburb: null, city: "City", region: "State", postcode: "ZIP code" },
    bank: {
      bankPlaceholder: "e.g. Chase",
      accountLabel: "How to pay you",
      accountPlaceholder: "e.g. Zelle: you@example.com",
      accountHint: "Bank routing and account number, or Zelle, Venmo or Cash App details.",
      payToLabel: "Pay to",
    },
    couriers: ["USPS", "UPS", "FedEx", "DHL", "Pickup"],
  },
  {
    code: "CA",
    name: "Canada",
    currency: "CAD",
    locale: "en-CA",
    timeZones: [
      { id: "America/Toronto", label: "Eastern" },
      { id: "America/Winnipeg", label: "Central" },
      { id: "America/Regina", label: "Saskatchewan" },
      { id: "America/Edmonton", label: "Mountain" },
      { id: "America/Vancouver", label: "Pacific" },
      { id: "America/Halifax", label: "Atlantic" },
      { id: "America/St_Johns", label: "Newfoundland" },
    ],
    address: { line2: "Apartment, suite or unit (optional)", suburb: null, city: "City", region: "Province", postcode: "Postal code" },
    bank: {
      bankPlaceholder: "e.g. RBC",
      accountLabel: "How to pay you",
      accountPlaceholder: "e.g. Interac e-Transfer: you@example.com",
      accountHint: "Your Interac e-Transfer email, or transit, institution and account numbers.",
      payToLabel: "Pay to",
    },
    couriers: ["Canada Post", "Purolator", "UPS", "FedEx", "Pickup"],
  },
  {
    code: "GB",
    name: "United Kingdom",
    currency: "GBP",
    locale: "en-GB",
    timeZones: [{ id: "Europe/London", label: "UK" }],
    address: {
      line2: "Flat, unit or building (optional)",
      suburb: null,
      city: "Town / city",
      region: "County",
      regionOptional: true,
      postcode: "Postcode",
    },
    bank: {
      bankPlaceholder: "e.g. Barclays",
      accountLabel: "Sort code and account number",
      accountPlaceholder: "Sort code 12-34-56, account 12345678",
      accountHint: "Your sort code and account number.",
      payToLabel: "Pay to",
    },
    couriers: ["Royal Mail", "Evri", "DPD", "Parcelforce", "Pickup"],
  },
];

// Businesses created before countries were added said "INTL" for anywhere outside NZ: treated as the US.
export function countryInfo(code: string | null | undefined): CountryInfo {
  return COUNTRIES.find((c) => c.code === code) ?? (code === "INTL" ? COUNTRIES.find((c) => c.code === "US")! : COUNTRIES[0]);
}

// How the owner's screens write each currency, so amounts in different currencies (e.g. a supplier order in
// US dollars) are never confused. Customers just see the local symbol.
const MONEY_PREFIX: Record<string, string> = { NZD: "NZ$", AUD: "A$", USD: "US$", CAD: "CA$", GBP: "£" };
export const moneyPrefix = (currency: string) => MONEY_PREFIX[currency] ?? `${currency} `;

// A price the way a shop's customers write it, e.g. "$90.00" in New Zealand or "£90.00" in the UK.
export function customerPrice(value: number, business: { country: string; currency: string }): string {
  return value.toLocaleString(countryInfo(business.country).locale, {
    style: "currency",
    currency: business.currency,
    currencyDisplay: "narrowSymbol",
  });
}

// The time zone a new business in this country starts with: the computer's own if it's one of the
// country's, else the country's main one.
export function defaultTimeZone(country: CountryInfo): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (country.timeZones.some((z) => z.id === zone)) return zone;
  } catch {
    // fall through
  }
  return country.timeZones[0].id;
}

export const isKnownTimeZone = (country: CountryInfo, zone: string) => country.timeZones.some((z) => z.id === zone);

// What's stored on a business for a country chosen at sign-up (or changed before its subscription starts), or
// null if it isn't one of COUNTRIES. A time zone that isn't the country's gets the country's main one.
export function businessCountrySettings(code: string, timeZone?: string | null) {
  const country = COUNTRIES.find((c) => c.code === code);
  if (!country) return null;
  return {
    country: country.code,
    currency: country.currency,
    timeZone: timeZone && isKnownTimeZone(country, timeZone) ? timeZone : country.timeZones[0].id,
  };
}
