// Customers: shared by the API, the admin area and the customer's own account page.

export interface ShippingAddress {
  line1: string; // street address
  line2: string; // apartment, unit, RD number... (optional)
  suburb: string;
  city: string;
  region: string; // state / province / county - not asked in New Zealand (missing on older addresses)
  postcode: string;
  country: string; // blank on older or new addresses until saved: the shop's own country
}

export interface CustomerDetails {
  name: string;
  email: string;
  shippingAddress: ShippingAddress;
}

export function emptyAddress(): ShippingAddress {
  return { line1: "", line2: "", suburb: "", city: "", region: "", postcode: "", country: "" };
}

// Fills any missing fields, e.g. on a customer created before an address was entered.
export function toAddress(value: unknown): ShippingAddress {
  const v = (value ?? {}) as Partial<Record<keyof ShippingAddress, unknown>>;
  const text = (x: unknown, fallback = "") => (typeof x === "string" ? x : fallback);
  return {
    line1: text(v.line1),
    line2: text(v.line2),
    suburb: text(v.suburb),
    city: text(v.city),
    region: text(v.region),
    postcode: text(v.postcode),
    country: text(v.country),
  };
}

// Enough to post an order to.
export function isAddressComplete(address: ShippingAddress): boolean {
  return Boolean(address.line1.trim() && address.city.trim() && address.postcode.trim());
}

// The address as lines for a label. The country is only added when it isn't the shop's own (homeCountry).
export function addressLines(address: ShippingAddress, homeCountry = "New Zealand"): string[] {
  const place = [address.city, address.region].map((s) => s.trim()).filter(Boolean).join(", ");
  return [
    address.line1,
    address.line2,
    address.suburb,
    [place, address.postcode.trim()].filter(Boolean).join(" "),
    address.country && address.country !== homeCountry ? address.country : "",
  ]
    .map((s) => s.trim())
    .filter(Boolean);
}
