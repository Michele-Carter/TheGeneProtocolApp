import React from "react";
import type { ShippingAddress } from "../../shared/customers";
import { homeCountry } from "../lib/locale";
import { Field, inputClass } from "./admin/ui";

// Shipping address form, used by the admin Customers screen and the customer's own account page. The fields
// and their names follow the shop's country (shared/countries.ts), e.g. Suburb in New Zealand, State and ZIP
// code in the US. A blank country means the shop's own.
export default function AddressFields({
  value,
  onChange,
  disabled,
}: {
  value: ShippingAddress;
  onChange: (address: ShippingAddress) => void;
  disabled?: boolean;
}) {
  const country = homeCountry();
  const labels = country.address;
  const field = (key: keyof ShippingAddress, autoComplete: string, placeholder?: string) => (
    <input
      className={inputClass}
      value={value[key] ?? ""}
      disabled={disabled}
      autoComplete={autoComplete}
      placeholder={placeholder}
      onChange={(e) => onChange({ ...value, [key]: e.target.value })}
    />
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <Field label="Street address">{field("line1", "address-line1", "e.g. 12 Example Street")}</Field>
      </div>
      <div className="sm:col-span-2">
        <Field label={labels.line2}>{field("line2", "address-line2")}</Field>
      </div>
      {labels.suburb && <Field label={labels.suburb}>{field("suburb", "address-level3")}</Field>}
      <Field label={labels.city}>{field("city", "address-level2")}</Field>
      {labels.region && (
        <Field label={labels.regionOptional ? `${labels.region} (optional)` : labels.region}>
          {field("region", "address-level1")}
        </Field>
      )}
      <Field label={labels.postcode}>{field("postcode", "postal-code")}</Field>
      <Field label="Country">{field("country", "country-name", country.name)}</Field>
    </div>
  );
}
