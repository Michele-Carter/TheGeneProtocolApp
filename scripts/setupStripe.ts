// One-off (safe to re-run): creates PepPal's subscription in the Stripe account in STRIPE_SECRET_KEY - the
// product, its monthly NZD and USD prices (found by the app by lookup key), and the settings for Stripe's
// billing page where owners change their card or cancel. Run once in test mode and once with the live key.
// Usage: npx tsx scripts/setupStripe.ts
import dotenv from "dotenv";
import Stripe from "stripe";
import { PLANS } from "../shared/billing";

dotenv.config({ path: ".env.local", quiet: true });
const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("STRIPE_SECRET_KEY is missing from .env.local");
const stripe = new Stripe(key);
console.log(`Stripe ${key.startsWith("sk_live_") ? "LIVE" : "test"} mode`);

const PRODUCT_NAME = "PepPal subscription";

// The product (one, shared by both prices).
// Listed rather than searched: search results can lag a few seconds behind a product just created.
const products = await stripe.products.list({ active: true, limit: 100 });
const product =
  products.data.find((p) => p.metadata.peppal === "subscription") ??
  (await stripe.products.create({
    name: PRODUCT_NAME,
    description: "Order, inventory and customer management software, billed monthly.",
    metadata: { peppal: "subscription" },
  }));
console.log(`Product: ${product.id}`);

for (const plan of Object.values(PLANS)) {
  const { data } = await stripe.prices.list({ lookup_keys: [plan.lookupKey], limit: 1 });
  const existing = data[0];
  if (existing && existing.unit_amount === plan.amount * 100 && existing.currency === plan.currency && existing.active) {
    console.log(`Price ${plan.lookupKey}: already set up (${existing.id})`);
    continue;
  }
  // A new amount gets a new price; transfer_lookup_key moves the lookup key so new sign-ups use it.
  const price = await stripe.prices.create({
    product: product.id,
    currency: plan.currency,
    unit_amount: plan.amount * 100,
    recurring: { interval: "month" },
    lookup_key: plan.lookupKey,
    transfer_lookup_key: true,
    nickname: plan.label,
  });
  console.log(`Price ${plan.lookupKey}: created ${price.id} (${plan.label})`);
}

// Stripe's billing page: update card, see invoices, cancel at the end of the paid month.
const configs = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
const portalSettings = {
  business_profile: { headline: "Manage your PepPal subscription" },
  features: {
    customer_update: { enabled: true, allowed_updates: ["email", "name", "address"] as const },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" as const },
  },
};
const portal = configs.data[0]
  ? await stripe.billingPortal.configurations.update(configs.data[0].id, {
      business_profile: portalSettings.business_profile,
      features: { ...portalSettings.features, customer_update: { ...portalSettings.features.customer_update, allowed_updates: [...portalSettings.features.customer_update.allowed_updates] } },
    })
  : await stripe.billingPortal.configurations.create({
      business_profile: portalSettings.business_profile,
      features: { ...portalSettings.features, customer_update: { ...portalSettings.features.customer_update, allowed_updates: [...portalSettings.features.customer_update.allowed_updates] } },
    });
console.log(`Billing page settings: ${portal.id}`);
console.log("Done.");
