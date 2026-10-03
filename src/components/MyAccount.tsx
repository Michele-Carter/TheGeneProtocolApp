import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { CheckCircle2, MapPin, Save } from "lucide-react";
import { emptyAddress, isAddressComplete, type ShippingAddress } from "../../shared/customers";
import { shopApi, type MyDetails } from "../lib/shopApi";
import AddressFields from "./AddressFields";
import { Card, ErrorNote, Field, inputClass, primaryButton } from "./admin/ui";
import LoadingSpinner, { Spinner } from "./LoadingSpinner";

interface Form {
  name: string;
  email: string;
  shippingAddress: ShippingAddress;
}

const toForm = (d: MyDetails): Form => ({ name: d.name, email: d.email, shippingAddress: d.shippingAddress });

export default function MyAccount() {
  const { getToken } = useAuth();
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form>({ name: "", email: "", shippingAddress: emptyAddress() });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const details = toForm(await shopApi.me(getToken));
      setSaved(details);
      setForm(details);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = saved != null && JSON.stringify(form) !== JSON.stringify(saved);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const details = toForm(await shopApi.updateMe(form, getToken));
      setSaved(details);
      setForm(details);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-black text-white tracking-tight">My Account</h2>
        <p className="text-sm text-slate-400">Your contact and shipping details for orders.</p>
      </div>

      {saved == null && !error && <LoadingSpinner label="Loading your details..." />}

      {saved != null && (
        <div className="max-w-2xl space-y-5">
          {!isAddressComplete(saved.shippingAddress) && (
            <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/30 border border-amber-900/60 rounded-lg px-3 py-2">
              <MapPin size={14} className="flex-shrink-0 mt-0.5" />
              Add your shipping address so we know where to send your orders.
            </div>
          )}

          <Card title="Your details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name">
                <input
                  className={inputClass}
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>
              <Field label="Email">
                <input
                  className={inputClass}
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </Field>
            </div>
          </Card>

          <Card title="Shipping address">
            <AddressFields value={form.shippingAddress} onChange={(shippingAddress) => setForm((f) => ({ ...f, shippingAddress }))} />
          </Card>

          <ErrorNote message={error} />
          <div className="flex items-center gap-3">
            <button className={primaryButton} onClick={save} disabled={busy || !dirty}>
              {busy ? <Spinner size={13} /> : <Save size={13} />} Save details
            </button>
            {justSaved && !dirty && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 size={13} /> Saved
              </span>
            )}
          </div>
        </div>
      )}

      {saved == null && <ErrorNote message={error} />}
    </div>
  );
}
