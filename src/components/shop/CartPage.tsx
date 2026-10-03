import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, ArrowLeft, Pencil, Send, ShoppingCart, Trash2 } from "lucide-react";
import { addressLines, isAddressComplete, type ShippingAddress } from "../../../shared/customers";
import type { ShopOrder, ShopProduct, ShopVariant } from "../../../shared/shop";
import { money, shopApi, type MyDetails } from "../../lib/shopApi";
import type { Cart } from "../../hooks/useCart";
import AddressFields from "../AddressFields";
import { ErrorNote } from "../admin/ui";
import LoadingSpinner, { Spinner } from "../LoadingSpinner";
import { ProductImage, QtyStepper, shopPrimary, shopSecondary, variantName } from "./parts";

interface LineView {
  key: string;
  qty: number;
  product: ShopProduct | null;
  variant: ShopVariant | null;
}

export default function CartPage({
  products,
  cart,
  onBack,
  onOpenAccount,
  onStockChanged,
  onSent,
}: {
  products: ShopProduct[];
  cart: Cart;
  onBack: () => void;
  onOpenAccount: () => void;
  onStockChanged: () => Promise<void>;
  onSent: (order: ShopOrder) => void;
}) {
  const { getToken } = useAuth();
  const [me, setMe] = useState<MyDetails | null>(null);
  const [editingAddress, setEditingAddress] = useState(false);
  const [address, setAddress] = useState<ShippingAddress | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<null | "address" | "send">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    shopApi
      .me(getToken)
      .then((details) => {
        setMe(details);
        setAddress(details.shippingAddress);
        setEditingAddress(!details.addressComplete);
      })
      .catch((e) => setError((e as Error).message));
  }, [getToken]);

  const lines: LineView[] = useMemo(
    () =>
      cart.lines.map((line) => {
        for (const product of products) {
          const variant = product.variants.find((v) => v.key === line.key);
          if (variant) return { ...line, product, variant };
        }
        return { ...line, product: null, variant: null };
      }),
    [cart.lines, products]
  );

  const subtotal = lines.reduce((t, l) => t + (l.variant ? l.variant.priceNzd * l.qty : 0), 0);
  const problems = lines.filter((l) => !l.variant || l.qty > l.variant.maxQty);
  const addressReady = me != null && !editingAddress && isAddressComplete(me.shippingAddress);

  const saveAddress = async () => {
    if (!me || !address) return;
    if (!isAddressComplete(address)) {
      setError("Please fill in your street address, town / city and postcode.");
      return;
    }
    setBusy("address");
    setError(null);
    try {
      const updated = await shopApi.updateMe({ name: me.name, email: me.email, shippingAddress: address }, getToken);
      setMe(updated);
      setAddress(updated.shippingAddress);
      setEditingAddress(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy("send");
    setError(null);
    try {
      const order = await shopApi.sendOrder({ lines: cart.lines, notes }, getToken);
      onSent(order);
    } catch (e) {
      setError((e as Error).message);
      // Stock may have changed since the shop loaded - refresh so the cart shows what's available now.
      await onStockChanged();
    } finally {
      setBusy(null);
    }
  };

  if (cart.lines.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl space-y-4">
        <ShoppingCart size={28} className="mx-auto text-slate-600" />
        <p className="text-sm text-slate-400">Your cart is empty.</p>
        <button className={shopPrimary} onClick={onBack}>
          Browse the shop
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-gold-400 hover:text-gold-300 cursor-pointer"
      >
        <ArrowLeft size={13} /> Continue shopping
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
        <section className="bg-slate-900/40 border border-slate-800 rounded-2xl divide-y divide-slate-800/80">
          {lines.map((line) => (
            <div key={line.key} className="p-4 flex gap-4">
              <ProductImage
                src={line.variant?.images[0] ?? line.product?.images[0]}
                alt={line.product?.name ?? ""}
                className="w-20 h-20 flex-shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-white">
                      {line.product && line.variant ? variantName(line.product, line.variant) : "Unavailable item"}
                    </div>
                    {line.variant && <div className="text-xs text-slate-500 tabular-nums">{money(line.variant.priceNzd)} each</div>}
                  </div>
                  <div className="text-sm font-black text-white tabular-nums">
                    {line.variant ? money(line.variant.priceNzd * line.qty) : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {line.variant && (
                    <QtyStepper
                      value={line.qty}
                      max={Math.max(line.qty > line.variant.maxQty ? line.qty : 1, line.variant.maxQty)}
                      onChange={(qty) => cart.setQty(line.key, qty)}
                    />
                  )}
                  <button
                    onClick={() => cart.remove(line.key)}
                    className="p-2 text-slate-500 hover:text-red-400 transition cursor-pointer"
                    aria-label="Remove from cart"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {!line.variant && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-300">
                    <AlertTriangle size={12} /> This is no longer available - please remove it.
                  </p>
                )}
                {line.variant && line.qty > line.variant.maxQty && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-300">
                    <AlertTriangle size={12} />
                    {line.variant.maxQty === 0
                      ? "Now sold out - please remove it."
                      : `Only ${line.variant.maxQty} available - please reduce the quantity.`}
                  </p>
                )}
              </div>
            </div>
          ))}
        </section>

        <div className="space-y-4">
          <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-gold-400">Order summary</h3>
            <div className="flex justify-between text-sm text-slate-300">
              <span>Subtotal</span>
              <span className="font-bold text-white tabular-nums">{money(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-300">
              <span>Shipping</span>
              <span className="text-slate-400">Confirmed by us</span>
            </div>
          </section>

          <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-gold-400">Ship to</h3>
              {me && !editingAddress && (
                <button
                  onClick={() => setEditingAddress(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer"
                >
                  <Pencil size={11} /> Change
                </button>
              )}
            </div>
            {me == null && !error && <LoadingSpinner label="Loading your details..." className="py-4" />}
            {me && !editingAddress && (
              <div className="text-sm text-slate-300 leading-relaxed">
                <div className="font-bold text-white">{me.name}</div>
                {addressLines(me.shippingAddress).map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
            )}
            {me && editingAddress && address && (
              <div className="space-y-3">
                {!me.addressComplete && <p className="text-xs text-slate-400">Where should we send your order?</p>}
                <AddressFields value={address} onChange={setAddress} />
                <div className="flex gap-2">
                  <button className={shopPrimary} onClick={saveAddress} disabled={busy != null}>
                    {busy === "address" && <Spinner size={13} />} Save address
                  </button>
                  {me.addressComplete && (
                    <button
                      className={shopSecondary}
                      onClick={() => {
                        setAddress(me.shippingAddress);
                        setEditingAddress(false);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  This also updates the address saved in{" "}
                  <button onClick={onOpenAccount} className="underline hover:text-white cursor-pointer">
                    My Account
                  </button>
                  .
                </p>
              </div>
            )}
          </section>

          <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-2">
            <label htmlFor="order-notes" className="text-[11px] font-black uppercase tracking-widest text-gold-400">
              Notes (optional)
            </label>
            <textarea
              id="order-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              placeholder="Anything we should know about your order?"
              className="w-full min-h-[5rem] resize-y bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-gold-500/60"
            />
          </section>

          <ErrorNote message={error} />

          <button
            className={`${shopPrimary} w-full py-3 text-sm`}
            onClick={send}
            disabled={busy != null || !addressReady || problems.length > 0}
          >
            {busy === "send" ? <Spinner size={14} /> : <Send size={14} />} Send order
          </button>
          <p className="text-xs text-slate-500 leading-relaxed">
            {!addressReady && me
              ? "Save your shipping address to send your order."
              : problems.length > 0
                ? "Please fix the items marked above to send your order."
                : "Nothing is charged now. We'll check your order, confirm it with the shipping cost, and let you know how to pay."}
          </p>
        </div>
      </div>
    </div>
  );
}
