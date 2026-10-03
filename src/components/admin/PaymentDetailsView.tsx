import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { CheckCircle2, Landmark, Save } from "lucide-react";
import { formatNzAccountNumber, type PaymentDetails } from "../../../shared/shop";
import { adminApi } from "../../lib/adminApi";
import { Card, ErrorNote, Field, inputClass, primaryButton } from "./ui";
import LoadingSpinner, { Spinner } from "../LoadingSpinner";

// The bank account customers pay into. Customers only see this on an order you've confirmed, until it's paid.
export default function PaymentDetailsView() {
  const { getToken } = useAuth();
  const [saved, setSaved] = useState<PaymentDetails | null>(null);
  const [form, setForm] = useState<PaymentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    adminApi
      .getSettings(getToken)
      .then(({ paymentDetails }) => {
        setSaved(paymentDetails);
        setForm(paymentDetails);
      })
      .catch((e) => setError((e as Error).message));
  }, [getToken]);

  if (!form || !saved) return error ? <ErrorNote message={error} /> : <LoadingSpinner label="Loading payment details..." />;

  const set = <K extends keyof PaymentDetails>(key: K, value: PaymentDetails[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const accountOk = form.accountNumber.trim() === "" || formatNzAccountNumber(form.accountNumber) != null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { paymentDetails } = await adminApi.updateSettings({ paymentDetails: form }, getToken);
      setSaved(paymentDetails);
      setForm(paymentDetails);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <Card title="Bank account">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Account name">
            <input className={inputClass} value={form.accountName} onChange={(e) => set("accountName", e.target.value)} />
          </Field>
          <Field label="Bank (optional)">
            <input
              className={inputClass}
              value={form.bankName}
              placeholder="e.g. ANZ"
              onChange={(e) => set("bankName", e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Account number"
              hint={accountOk ? "e.g. 12-3456-7890123-00 - spaces or dashes are fine." : "NZ account numbers look like 12-3456-7890123-00."}
            >
              <input
                className={`${inputClass} font-mono ${accountOk ? "" : "border-red-500/70"}`}
                value={form.accountNumber}
                inputMode="numeric"
                placeholder="12-3456-7890123-00"
                onChange={(e) => set("accountNumber", e.target.value)}
                onBlur={() => {
                  const formatted = formatNzAccountNumber(form.accountNumber);
                  if (formatted) set("accountNumber", formatted);
                }}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Extra instructions (optional)" hint="Anything else customers should know, e.g. how soon to pay.">
              <textarea
                className={`${inputClass} min-h-[4.5rem] resize-y`}
                value={form.instructions}
                onChange={(e) => set("instructions", e.target.value)}
              />
            </Field>
          </div>
        </div>

        <ErrorNote message={error} />
        <div className="flex items-center gap-3 mt-4">
          <button className={primaryButton} onClick={save} disabled={busy || !dirty || !accountOk}>
            {busy ? <Spinner size={13} /> : <Save size={13} />} Save payment details
          </button>
          {justSaved && !dirty && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 size={13} /> Saved
            </span>
          )}
        </div>
      </Card>

      <Card title="What customers see">
        <p className="text-xs text-slate-400 mb-3">
          Only on an order you've confirmed, until it's marked paid - never before. Their order number is the payment
          reference.
        </p>
        <div className="flex gap-2.5 text-sm text-slate-300 border border-slate-800 rounded-2xl p-4">
          <Landmark size={15} className="text-gold-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold text-white">How to pay: $72.50</div>
            {form.bankName && <div>Bank: {form.bankName}</div>}
            <div>Account name: {form.accountName || "—"}</div>
            <div>
              Account number: <span className="font-mono">{formatNzAccountNumber(form.accountNumber) ?? (form.accountNumber || "—")}</span>
            </div>
            <div>
              Reference: <span className="font-bold text-white">#1001</span>
            </div>
            {form.instructions && <div className="text-slate-400 whitespace-pre-line pt-1">{form.instructions}</div>}
          </div>
        </div>
      </Card>
    </div>
  );
}
