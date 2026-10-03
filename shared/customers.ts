// Customers: shared by the API, the admin area and the customer's own account page.

export interface ShippingAddress {
  line1: string; // street address
  line2: string; // apartment, unit, RD number... (optional)
  suburb: string;
  city: string;
  postcode: string;
  country: string;
}

export interface CustomerDetails {
  name: string;
  email: string;
  shippingAddress: ShippingAddress;
}

export function emptyAddress(): ShippingAddress {
  return { line1: "", line2: "", suburb: "", city: "", postcode: "", country: "New Zealand" };
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
    postcode: text(v.postcode),
    country: text(v.country, "New Zealand") || "New Zealand",
  };
}

// Enough to post an order to.
export function isAddressComplete(address: ShippingAddress): boolean {
  return Boolean(address.line1.trim() && address.city.trim() && address.postcode.trim());
}

export function addressLines(address: ShippingAddress): string[] {
  return [
    address.line1,
    address.line2,
    address.suburb,
    [address.city, address.postcode].filter((s) => s.trim()).join(" "),
    address.country && address.country !== "New Zealand" ? address.country : "",
  ]
    .map((s) => s.trim())
    .filter(Boolean);
}
