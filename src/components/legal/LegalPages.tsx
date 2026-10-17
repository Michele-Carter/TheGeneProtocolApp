import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { BusinessInfo } from "../../../shared/billing";
import { businessApi } from "../../lib/business";
import { PEPBIZ_ICON, setTabBranding } from "../../lib/tabBranding";
import LoadingSpinner from "../LoadingSpinner";

// Public pages, readable without signing in (main.tsx shows them for these addresses):
//   /privacy, /terms            PepBiz's own Privacy Policy and Terms of Service, for business owners
//   /shop/<link>/privacy        a shop's privacy notice for its customers, in the shop's own name - it never
//                               mentions PepBiz (customers only ever see their shop)
// Keep these in step with what the app actually does (the services used, the 30 days after a subscription ends).

export const LEGAL_UPDATED = "18 October 2026";
export const SUPPORT_EMAIL = "support@pepbiz.io";
// The business that operates PepBiz. A placeholder until it's set up - then change it here.
const OPERATOR = "PepBiz";

// Which legal page an address is, if any.
export type LegalRoute = { kind: "privacy" } | { kind: "terms" } | { kind: "shop-privacy"; slug: string };
export function legalRoute(pathname: string): LegalRoute | null {
  if (/^\/privacy\/?$/i.test(pathname)) return { kind: "privacy" };
  if (/^\/terms\/?$/i.test(pathname)) return { kind: "terms" };
  const shop = /^\/shop\/([a-z0-9-]{3,40})\/privacy\/?$/i.exec(pathname);
  return shop ? { kind: "shop-privacy", slug: shop[1].toLowerCase() } : null;
}

export default function LegalPage({ route }: { route: LegalRoute }) {
  if (route.kind === "shop-privacy") return <ShopPrivacyPage slug={route.slug} />;
  return route.kind === "privacy" ? <PepBizPrivacy /> : <PepBizTerms />;
}

// ---- Layout ----

function Layout({
  logo,
  eyebrow,
  title,
  back,
  children,
}: {
  logo: string | null;
  eyebrow: string;
  title: string;
  back: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#09090B] text-zinc-300 px-4 py-8 sm:py-12">
      <article className="mx-auto w-full max-w-3xl">
        <a href={back.href} className="inline-flex items-center gap-1.5 text-xs font-bold text-gold-400 hover:text-gold-300">
          <ArrowLeft size={13} /> {back.label}
        </a>
        <header className="mt-6 mb-8 flex items-center gap-3">
          {logo && <img src={logo} alt="" className="h-12 w-12 object-contain rounded-xl" />}
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-gold-400 font-bold">{eyebrow}</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">{title}</h1>
            <p className="text-xs text-zinc-500 mt-1">Last updated {LEGAL_UPDATED}</p>
          </div>
        </header>
        <div className="space-y-7 text-sm leading-relaxed">{children}</div>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-base font-black text-white">{title}</h2>
      {children}
    </section>
  );
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 marker:text-zinc-600">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

const Mail = ({ to }: { to: string }) => (
  <a href={`mailto:${to}`} className="text-gold-400 hover:text-gold-300 break-all">
    {to}
  </a>
);

function usePepBizTab(title: string) {
  useEffect(() => setTabBranding(`${title} - PepBiz`, PEPBIZ_ICON), [title]);
}

// ---- PepBiz Privacy Policy ----

function PepBizPrivacy() {
  usePepBizTab("Privacy Policy");
  return (
    <Layout logo={PEPBIZ_ICON} eyebrow="PepBiz" title="Privacy Policy" back={{ href: "/", label: "Back to PepBiz" }}>
      <p>
        This policy explains what personal information {OPERATOR} ("we", "us") collects when businesses use PepBiz, how we
        use it, who we share it with, and the choices you have. We follow the New Zealand Privacy Act 2020, and the privacy
        laws of the other countries our businesses are in where they apply to us.
      </p>

      <Section title="Who this policy covers">
        <p>
          PepBiz is software that businesses use to run their own online shop, orders, stock and records. This policy
          covers the people who run those businesses (<strong className="text-white">business owners</strong>) and anyone
          who visits pepbiz.io.
        </p>
        <p>
          When a business's customers use its shop, <strong className="text-white">that business</strong> is responsible
          for its customers' information, and we hold it on the business's behalf - we only use it to run the business's
          shop for it. Customers can read each shop's own privacy notice on its sign-in page, and should contact the shop
          about their information.
        </p>
      </Section>

      <Section title="Information we collect">
        <List
          items={[
            <>
              <strong className="text-white">Your account:</strong> your name and email address, and your sign-in details
              (handled by our sign-in provider). If you choose to sign in with Google, Google shares your name, email and
              profile picture with us.
            </>,
            <>
              <strong className="text-white">Your business:</strong> its name, logo, shop link, country, currency, time
              zone, contact email, and the payment details you enter for your customers to pay you.
            </>,
            <>
              <strong className="text-white">Your subscription:</strong> your card is entered on Stripe's secure page and
              never reaches us. We receive your subscription's status, its billing dates and the country your card was
              issued in (to check the right price applies).
            </>,
            <>
              <strong className="text-white">What you put into PepBiz:</strong> products, prices, photos, stock, supplier
              orders, expenses, customer orders, your customers' names, email and shipping addresses, and the messages you and your customers send each other in the app.
            </>,
            <>
              <strong className="text-white">Personal tools:</strong> if you use the Protocol Builder, Dosage &amp; Recon or
              Research Logs, what you save there. This can include health-related information, so we treat it with extra
              care: only you can see it in the app.
            </>,
            <>
              <strong className="text-white">Notifications:</strong> if you turn on new-order alerts, a technical address
              for each device your browser gives us so it can receive them.
            </>,
            <>
              <strong className="text-white">Technical information:</strong> basic information needed to run the service
              securely, such as browser type, sign-in times and error logs.
            </>,
          ]}
        />
      </Section>

      <Section title="How we use it">
        <List
          items={[
            "To provide PepBiz: your account, your shop, your records and your customers' orders.",
            "To run your subscription, payments and receipts (through Stripe).",
            "To send you service messages, such as sign-in codes, order alerts and important changes.",
            "To keep PepBiz secure, fix problems and improve it.",
            "To meet our legal obligations.",
          ]}
        />
        <p>
          We do not sell personal information, show advertising, or use your business's or customers' information for
          anything other than providing PepBiz to you.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>We use trusted service providers to run PepBiz. They only use the information to provide their service to us:</p>
        <List
          items={[
            <>
              <strong className="text-white">Vercel</strong> - hosts the app and stores product photos and logos (data
              stored in Sydney, Australia).
            </>,
            <>
              <strong className="text-white">Neon</strong> - our database, where your business's records are kept (Sydney,
              Australia).
            </>,
            <>
              <strong className="text-white">Clerk</strong> - sign-in and accounts, including sign-in emails (United
              States).
            </>,
            <>
              <strong className="text-white">Stripe</strong> - subscription payments (United States and other countries).
            </>,
            <>
              <strong className="text-white">Google</strong> - only if you choose to sign in with Google.
            </>,
            <>
              <strong className="text-white">Your browser's notification service</strong> (for example Google, Apple or
              Mozilla) - only if you turn on notifications, to deliver them to your device.
            </>,
          ]}
        />
        <p>
          We may also share information if the law requires it, to protect people's safety or our legal rights, or as part
          of selling or reorganising the PepBiz business (in which case this policy would continue to apply).
        </p>
      </Section>

      <Section title="Information stored outside New Zealand">
        <p>
          Our service providers store and process information in Australia, the United States and other countries. We use
          providers that are required to protect it to standards comparable to New Zealand's privacy law.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your business's information while your subscription is running. If your subscription ends, we keep it for
          30 days so you can restart and pick up where you left off, and then permanently delete your business and
          everything in it, including your customers' information. Copies in our backups are overwritten in the weeks after
          that. Before your subscription ends, make sure you've kept any records you need, for example for tax. If you register
          a business but never start a subscription, we delete it 30 days after you registered.
        </p>
        <p>We may keep a record of payments and invoices for as long as the law requires.</p>
      </Section>

      <Section title="Keeping it safe">
        <p>
          Information is encrypted when it's sent and stored with providers that encrypt it at rest. Each business's records
          are kept separate from every other business's by the database itself, and only you can see your business's
          information in the app.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask to see the personal information we hold about you, and ask us to correct it or delete it. Most of it
          you can view and change yourself in the app. Email <Mail to={SUPPORT_EMAIL} /> and we'll respond within 20 working
          days. Depending on where you live (for example the UK or Australia), you may have further rights, such as asking
          for a copy of your information or objecting to how it's used - ask us and we'll help.
        </p>
      </Section>

      <Section title="Cookies and storage in your browser">
        <p>
          PepBiz uses cookies and your browser's storage to keep you signed in and to remember things like which shop you
          joined and your settings. We don't use advertising or tracking cookies.
        </p>
      </Section>

      <Section title="Children">
        <p>PepBiz is for businesses and people aged 18 or over.</p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We'll update this page if anything changes, and tell business owners by email or in the app about important
          changes.
        </p>
      </Section>

      <Section title="Contact us">
        <p>
          {OPERATOR} - <Mail to={SUPPORT_EMAIL} />
        </p>
      </Section>
    </Layout>
  );
}

// ---- PepBiz Terms of Service ----

function PepBizTerms() {
  usePepBizTab("Terms of Service");
  return (
    <Layout logo={PEPBIZ_ICON} eyebrow="PepBiz" title="Terms of Service" back={{ href: "/", label: "Back to PepBiz" }}>
      <p>
        These terms are an agreement between you (the business using PepBiz) and {OPERATOR} ("we", "us"). By registering a
        business or using PepBiz you agree to them. Please read them, along with our <a href="/privacy" className="text-gold-400 hover:text-gold-300">Privacy Policy</a>.
      </p>

      <Section title="1. What PepBiz is">
        <p>
          PepBiz is software for running your business: your own online shop for your customers, orders, stock, costs,
          customers and records, plus reference and calculation tools. We provide the software only. We don't sell, supply
          or handle any products, we're not part of any sale between you and your customers, and we don't handle payments
          from your customers to you.
        </p>
      </Section>

      <Section title="2. Your account">
        <List
          items={[
            "You must be at least 18 and able to enter into this agreement for your business.",
            "Give us accurate details and keep them up to date.",
            "Keep your sign-in secure. You're responsible for what happens in your account.",
            "Tell us straight away at " + SUPPORT_EMAIL + " if you think someone else has access to it.",
          ]}
        />
      </Section>

      <Section title="3. Free trial, subscription and payments">
        <List
          items={[
            "New businesses get a free trial (14 days, or longer if you were given an invite link). A card is needed to start it, and you won't be charged if you cancel before it ends.",
            "After the trial, your subscription renews each month at the price shown when you registered (NZ$20 a month in New Zealand, US$20 a month elsewhere) until you cancel.",
            "Payments are taken by Stripe. If a payment fails, Stripe will retry it; if it can't be collected, your access will pause until it's paid.",
            "We may change our prices. We'll tell you at least 30 days before a change affects you, and you can cancel before it does.",
            "Prices are as shown. If we become required to charge GST or another tax, we'll tell you before adding it.",
          ]}
        />
      </Section>

      <Section title="4. Cancelling">
        <p>
          You can cancel at any time on the Business page in the app. Your subscription then stops renewing, and you can keep
          using PepBiz until the end of the time you've paid for. We don't refund part-months. Your shop closes to your
          customers when your subscription ends.
        </p>
        <p>
          After it ends we keep your business's information for 30 days in case you want to restart, then permanently delete
          it - including your customers' details and your orders. Keep any records you need (for example for tax) before
          then.
        </p>
      </Section>

      <Section title="5. Your business and your products">
        <p>You're responsible for your business, including:</p>
        <List
          items={[
            "the products you sell and everything said about them - including making sure they're legal to sell, advertise, store and ship where you and your customers are;",
            "following the laws that apply to your business, such as consumer, product, health, import, privacy and tax laws;",
            "your dealings with your customers: orders, payments, refunds, delivery and any disputes; and",
            "the prices, payment details and other information you show your customers.",
          ]}
        />
      </Section>

      <Section title="6. Your customers' information">
        <p>
          Your customers' information belongs to your business, and you're responsible for it under privacy law. We hold and
          process it on your behalf only to provide PepBiz to you, as described in our Privacy Policy. Each shop shows its
          customers a privacy notice in your business's name, using the contact email you set on the Business page - keep
          that email up to date and respond to customers' privacy requests.
        </p>
      </Section>

      <Section title="7. Acceptable use">
        <p>Don't use PepBiz to:</p>
        <List
          items={[
            "break any law, or sell anything you're not allowed to sell;",
            "mislead people, or make claims about products that aren't allowed where you or your customers are;",
            "send spam, or upload anything harmful, offensive or that you don't have the right to use;",
            "try to access other businesses' information, interfere with PepBiz, or copy or reverse-engineer it.",
          ]}
        />
      </Section>

      <Section title="8. Reference information and tools">
        <p>
          The peptide library, protocol tools, calculators and any other reference information in PepBiz are general
          information for research and education. They are not medical advice, may contain errors or be out of date, and
          shouldn't be relied on for any decision about anyone's health. Always check calculations yourself.
        </p>
      </Section>

      <Section title="9. Your data and our software">
        <p>
          You own the information you put into PepBiz. You let us store and process it to provide the service to you. We
          own PepBiz itself - the software, design and content we provide.
        </p>
      </Section>

      <Section title="10. Availability and changes">
        <p>
          We work to keep PepBiz running and your information safe, but we can't promise it will always be available or free
          of errors. We may change, add or remove features, and we'll tell you before a change that takes away something
          important you rely on.
        </p>
      </Section>

      <Section title="11. Suspending or ending your account">
        <p>
          We may suspend or close your account if you don't pay, break these terms, or use PepBiz in a way that could cause
          harm or legal problems for us or others. Where we reasonably can, we'll tell you first and give you a chance to fix
          it.
        </p>
      </Section>

      <Section title="12. Liability">
        <List
          items={[
            "PepBiz is provided as it is. As far as the law allows, we don't make promises about it beyond those in these terms.",
            "You're using PepBiz for your business, so you agree the Consumer Guarantees Act 1993 (New Zealand) doesn't apply. Nothing in these terms removes rights that the law says can't be removed, such as some rights under the Australian Consumer Law.",
            "As far as the law allows, we're not liable for lost profits, lost revenue, lost data or other indirect losses, and our total liability to you is limited to the subscription fees you paid us in the 3 months before the claim.",
            "You agree to cover us for claims made against us because of your products, your dealings with your customers, or your breach of these terms or the law.",
          ]}
        />
      </Section>

      <Section title="13. Changes to these terms">
        <p>
          We may update these terms. We'll tell you about important changes by email or in the app at least 14 days before
          they take effect. If you keep using PepBiz after that, the new terms apply; if you don't agree, you can cancel.
        </p>
      </Section>

      <Section title="14. General">
        <p>
          These terms are governed by New Zealand law, and New Zealand courts deal with any dispute. If part of these terms
          can't be enforced, the rest still applies.
        </p>
      </Section>

      <Section title="Contact us">
        <p>
          {OPERATOR} - <Mail to={SUPPORT_EMAIL} />
        </p>
      </Section>
    </Layout>
  );
}

// ---- A shop's privacy notice, for its customers (in the shop's own name - never PepBiz) ----

function ShopPrivacyPage({ slug }: { slug: string }) {
  const [shop, setShop] = useState<BusinessInfo | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    businessApi
      .shop(slug)
      .then((found) => {
        setShop(found);
        setTabBranding(`Privacy - ${found.name}`, found.logoUrl ?? null, slug);
      })
      .catch(() => setMissing(true));
  }, [slug]);

  if (missing) {
    return (
      <div className="min-h-dvh bg-[#09090B] text-zinc-300 flex items-center justify-center px-4 text-sm">
        We couldn't find that shop. Please check the link.
      </div>
    );
  }
  if (!shop) {
    return (
      <div className="min-h-dvh bg-[#09090B] flex items-center justify-center">
        <LoadingSpinner label="Loading..." />
      </div>
    );
  }

  const name = shop.name;
  const contact = shop.contactEmail ? <Mail to={shop.contactEmail} /> : <span className="text-white">{name}</span>;
  return (
    <Layout logo={shop.logoUrl} eyebrow={name} title="Privacy Notice" back={{ href: `/shop/${slug}`, label: `Back to ${name}` }}>
      <p>
        This notice explains how {name} ("we", "us") collects and uses your personal information when you register with
        and order from our shop.
      </p>

      <Section title="Information we collect">
        <List
          items={[
            "Your name, email address and sign-in details.",
            "Your shipping address.",
            "Your orders, payment confirmations you send us, and the messages you send us in the app.",
            "If you turn on notifications, a technical address for your device so we can send them.",
            "If you use the planning, dosage or logging tools, what you save there. This can include health-related information - only you can see it.",
          ]}
        />
      </Section>

      <Section title="How we use it">
        <List
          items={[
            "To create and run your account.",
            "To process, confirm, ship and support your orders.",
            "To send you updates about your orders and reply to your messages.",
            "To keep records our business needs, including for tax.",
          ]}
        />
        <p>We don't sell your information or use it for advertising.</p>
      </Section>

      <Section title="Who we share it with">
        <p>
          Couriers or delivery services, to send your orders. We also use service providers to run our shop - hosting, data
          storage and sign-in - which store information in New Zealand, Australia, the United States and other countries
          and only use it to provide their service to us. We may also share information if the law requires it.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your information while you have an account with us and for as long as we need it for our business records
          and the law. If you'd like your account deleted, contact us.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can see and update most of your details in My Account. You can also ask us for the information we hold about
          you, and ask us to correct or delete it, by contacting {contact}.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We use cookies and your browser's storage to keep you signed in and remember your settings - not for advertising
          or tracking.
        </p>
      </Section>

      <Section title="Contact us">
        <p>
          {name}
          {shop.contactEmail ? (
            <>
              {" "}
              - <Mail to={shop.contactEmail} />
            </>
          ) : null}
        </p>
      </Section>
    </Layout>
  );
}
