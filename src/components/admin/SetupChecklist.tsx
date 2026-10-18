import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Check, CheckCircle2, ChevronRight, Circle, Copy, PartyPopper, X } from "lucide-react";
import type { SetupStatus } from "../../../shared/shop";
import { adminApi } from "../../lib/adminApi";
import { secondaryButton } from "./ui";
import type { AdminSection } from "./AdminArea";

// Admin home: "Get your shop ready" - the steps a new business needs, each ticked off by itself once it's actually
// done (api/admin setup). Each step opens the normal screen for it. Gone once everything's done, the owner hides it,
// or customers are already ordering from the shop (so established businesses never see it).

interface Step {
  title: string;
  text: string;
  done: boolean;
  go?: () => void;
}

// The Business page loads its cards after it opens, so wait for Order alerts to appear before scrolling to it.
function scrollToWhenShown(id: string) {
  let tries = 0;
  const timer = window.setInterval(() => {
    const el = document.getElementById(id);
    if (el || ++tries > 40) {
      window.clearInterval(timer);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, 100);
}

export default function SetupChecklist({ slug, onNavigate }: { slug: string; onNavigate: (section: AdminSection) => void }) {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const [finishedNow, setFinishedNow] = useState(false); // the last step was done here - say so before going

  useEffect(() => {
    adminApi.getSetup(getToken).then(setStatus).catch(() => setStatus(null));
  }, [getToken]);

  if (!status || status.dismissed || (status.hasShopOrders && !finishedNow)) return null;

  const shopLink = `${window.location.origin}/shop/${slug}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shopLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is shown, so it can still be copied by hand.
    }
    try {
      const next = await adminApi.saveSetup({ linkShared: true }, getToken);
      if (stepsFor(next).every((s) => s.done)) setFinishedNow(true);
      setStatus(next);
    } catch {
      // Ticks itself next time (or once a customer signs up).
    }
  };

  const hide = () => {
    setStatus({ ...status, dismissed: true });
    adminApi.saveSetup({ dismissed: true }, getToken).catch(() => {});
  };

  const stepsFor = (s: SetupStatus): Step[] => [
    { title: "Create your business", text: "Done - welcome to PepBiz.", done: true },
    {
      title: "Add your logo",
      text: "Shown in your shop and on your customers' notifications. You can pick your brand colour there too.",
      done: s.logo,
      go: () => onNavigate("business"),
    },
    {
      title: "Add your bank account",
      text: "Where customers pay you. They only see it once you've confirmed their order.",
      done: s.paymentDetails,
      go: () => onNavigate("payment-details"),
    },
    {
      title: "Turn on notifications",
      text: "A pop-up on your phone for new orders and messages, even when the app is closed.",
      done: s.alerts,
      go: () => {
        onNavigate("business");
        scrollToWhenShown("order-alerts");
      },
    },
    {
      title: "Add your stock",
      text: "In Inventory, tap Add stock to enter what you have on hand.",
      done: s.stock,
      go: () => onNavigate("inventory"),
    },
    {
      title: "Put products in your shop",
      text: "Open an item in Inventory and give it a price in its Shop section. Only priced items show in your shop.",
      done: s.inShop,
      go: () => onNavigate("inventory"),
    },
    {
      title: "Share your shop link",
      text: "Send it to your customers - they sign up with it, then order and message you.",
      done: s.linkShared,
    },
  ];

  const steps = stepsFor(status);
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  if (allDone && !finishedNow) return null;

  if (allDone) {
    return (
      <section className="flex items-start gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 md:p-5">
        <PartyPopper size={20} className="mt-0.5 flex-shrink-0 text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">Your shop is ready</p>
          <p className="text-xs text-slate-400">Customers can now sign up with your link, order, and message you.</p>
        </div>
        <button className="-m-1 cursor-pointer rounded p-1 text-slate-400 hover:text-white" aria-label="Close" onClick={hide}>
          <X size={16} />
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gold-500/40 bg-gold-500/[0.06] p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-white">Get your shop ready</h3>
          <p className="text-xs text-slate-400">
            {doneCount} of {steps.length} done - each step ticks itself off once you've done it.
          </p>
        </div>
        <button className="cursor-pointer text-[11px] text-slate-500 hover:text-white whitespace-nowrap" onClick={hide}>
          Hide
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-gold-400 transition-all duration-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <ol className="mt-4 divide-y divide-slate-800/80">
        {steps.map((step) => {
          const isShare = step.title === "Share your shop link";
          const Row = step.go && !step.done ? "button" : "div";
          return (
            <li key={step.title}>
              <Row
                {...(Row === "button" ? { type: "button" as const, onClick: step.go } : {})}
                className={`flex w-full items-start gap-3 py-3 text-left ${Row === "button" ? "group cursor-pointer" : ""}`}
              >
                {step.done ? (
                  <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-emerald-400" />
                ) : (
                  <Circle size={18} className="mt-0.5 flex-shrink-0 text-slate-600" />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className={`text-sm font-bold ${step.done ? "text-slate-500 line-through decoration-slate-600" : "text-white group-hover:text-gold-300"}`}>
                    {step.title}
                  </p>
                  {!step.done && <p className="text-xs text-slate-400">{step.text}</p>}
                  {isShare && !step.done && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="max-w-full truncate rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-[11px] text-slate-300">
                        {shopLink}
                      </span>
                      <button className={secondaryButton} onClick={() => void copyLink()}>
                        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy link"}
                      </button>
                    </div>
                  )}
                </div>
                {Row === "button" && <ChevronRight size={16} className="mt-0.5 flex-shrink-0 text-slate-500 group-hover:text-gold-300" />}
              </Row>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
