import React, { useEffect, useRef, useState } from "react";
import { BadgeCheck, Ban, Bell, CheckCircle2, Truck, XCircle } from "lucide-react";
import type { CustomerNotification, NotificationKind } from "../../shared/shop";
import { formatDateTime } from "../lib/locale";

const ICONS: Record<NotificationKind, React.ReactNode> = {
  confirmed: <CheckCircle2 size={14} className="text-emerald-400" />,
  declined: <XCircle size={14} className="text-red-400" />,
  sent: <Truck size={14} className="text-gold-400" />,
  paid: <BadgeCheck size={14} className="text-emerald-400" />,
  cancelled: <Ban size={14} className="text-red-400" />,
};

const when = (iso: string) =>
  formatDateTime(iso, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Bell with an unread count. Opening it marks everything read; clicking a notification opens My Orders.
export default function NotificationBell({
  items,
  unread,
  onOpen,
  onSelect,
  placement,
}: {
  items: CustomerNotification[];
  unread: number;
  onOpen: () => void;
  onSelect: () => void;
  placement: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  // What was unread when the panel opened, so those stay highlighted while it's open.
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      setHighlight(new Set(items.filter((n) => !n.read).map((n) => n.id)));
      onOpen();
    }
    setOpen(!open);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900/60 transition cursor-pointer"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-gold-500 text-slate-950 text-[10px] font-black flex items-center justify-center tabular-nums">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          // The app's card grey (not near-black). Opening down (the phone header), it spans the screen with an even
          // gap each side - pinned to the bell it ran off the left edge.
          className={`z-[90] bg-[#232329] border border-[#2B2B31] rounded-xl shadow-2xl overflow-hidden ${
            placement === "up"
              ? "absolute w-[min(20rem,calc(100vw-2rem))] bottom-full mb-2 left-0"
              : "fixed left-4 right-4 top-[4.75rem] sm:left-auto sm:w-[22rem]"
          }`}
        >
          <div className="px-4 py-2.5 border-b border-[#2B2B31] text-[11px] font-black uppercase tracking-widest text-gold-400">
            Notifications
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-xs text-slate-500 text-center">Nothing yet - updates on your orders appear here.</p>
          ) : (
            <div className="max-h-[min(20rem,60vh)] overflow-y-auto divide-y divide-[#2B2B31]">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setOpen(false);
                    onSelect();
                  }}
                  className={`w-full text-left px-4 py-3 flex gap-2.5 hover:bg-[#2B2B31] transition cursor-pointer ${
                    highlight.has(n.id) ? "bg-gold-500/5" : ""
                  }`}
                >
                  <span className="mt-0.5 flex-shrink-0">{ICONS[n.kind]}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-white">{n.title}</span>
                    {n.body && <span className="block text-[11px] text-slate-400 whitespace-pre-line line-clamp-3">{n.body}</span>}
                    <span className="block text-[10px] text-slate-500 mt-0.5">{when(n.createdAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
