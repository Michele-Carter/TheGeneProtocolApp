import React from "react";
import type { ShippingAddress } from "../../shared/customers";
import { Field, inputClass } from "./admin/ui";

// Shipping address form, used by the admin Customers screen and the customer's own account page.
export default function AddressFields({
  value,
  onChange,
  disabled,
}: {
  value: ShippingAddress;
  onChange: (address: ShippingAddress) => void;
  disabled?: boolean;
}) {
  const field = (key: keyof ShippingAddress, autoComplete: string, placeholder?: string) => (
    <input
      className={inputClass}
      value={value[key]}
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
        <Field label="Apartment, unit or RD (optional)">{field("line2", "address-line2")}</Field>
      </div>
      <Field label="Suburb">{field("suburb", "address-level3")}</Field>
      <Field label="Town / city">{field("city", "address-level2")}</Field>
      <Field label="Postcode">{field("postcode", "postal-code")}</Field>
      <Field label="Country">{field("country", "country-name")}</Field>
    </div>
  );
}
