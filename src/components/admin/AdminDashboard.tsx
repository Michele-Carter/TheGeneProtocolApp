import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { ChevronRight, Clock, Inbox, PiggyBank, Receipt, ShoppingBag, Truck, Wallet } from "lucide-react";
import { adminApi, nzd, type ExpenseRecord, type SaleRecord } from "../../lib/adminApi";
import { Card, ErrorNote } from "./ui";
import LoadingSpinner from "../LoadingSpinner";
import { MONTHS } from "../../lib/protocolBuilderUtils";
import type { AdminSection } from "./AdminArea";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return out;
}

function shortMonth(m: string): string {
  const [, mm] = m.split("-");
  return MONTHS[Number(mm) - 1].slice(0, 3);
}

// Eases the displayed number up to its target whenever the target changes, instead of snapping.
function useCountUp(target: number, durationMs = 700) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      prevRef.current = target;
      setDisplay(target);
      return;
    }
    const start = prevRef.current;
    const diff = target - start;
    if (Math.abs(diff) < 0.005) {
      setDisplay(target);
      prevRef.current = target;
      return;
    }
    const startTime = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(start + diff * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return display;
}

const TILE_TONE = {
  gold: "text-gold-400",
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-red-400",
  slate: "text-slate-300",
} as const;

function Sparkline({ values, className = "stroke-slate-600" }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-16 h-6 overflow-visible flex-shrink-0" preserveAspectRatio="none">
      <polyline points={points} fill="none" className={className} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatTile({
  label,
  value,
  format,
  icon,
  tone,
  trend,
  onClick,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  icon: React.ReactNode;
  tone: keyof typeof TILE_TONE;
  trend?: number[];
  onClick?: () => void;
}) {
  const display = useCountUp(value);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`text-left bg-slate-900/40 border border-slate-800 rounded-2xl px-4 py-3.5 flex flex-col gap-2 transition ${
        onClick ? "cursor-pointer hover:border-gold-500/40 hover:bg-slate-900/70" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-slate-500">
          <span className={TILE_TONE[tone]}>{icon}</span>
          {label}
        </div>
        {trend && trend.length > 1 && <Sparkline values={trend} className={TILE_TONE[tone].replace("text-", "stroke-")} />}
      </div>
      <div className={`text-xl md:text-2xl font-black tabular-nums ${TILE_TONE[tone]}`}>{format(display)}</div>
    </Tag>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
      <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${className}`} />
      {label}
    </span>
  );
}

// Grouped bar chart: Sales (gold, the lead series) vs Expenses (slate, de-emphasized context) per month.
function SalesExpensesChart({ months, sales, expenses }: { months: string[]; sales: number[]; expenses: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const max = Math.max(...sales, ...expenses, 1);

  if (sales.every((v) => v === 0) && expenses.every((v) => v === 0)) {
    return <p className="text-xs text-slate-500 py-10 text-center">No sales or expenses recorded yet.</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <LegendSwatch className="bg-gold-400" label="Sales" />
        <LegendSwatch className="bg-slate-500" label="Expenses" />
      </div>
      <div className="flex items-end gap-1 sm:gap-1.5 h-44 sm:h-52 border-b border-slate-800/80">
        {months.map((m, i) => (
          <div
            key={m}
            className="relative flex-1 min-w-0 h-full flex items-end justify-center gap-0.5"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            onFocus={() => setHover(i)}
            onBlur={() => setHover((h) => (h === i ? null : h))}
            tabIndex={0}
          >
            {hover === i && (
              <div className="absolute bottom-full mb-2 z-10 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-2xl pointer-events-none">
                <div className="font-bold text-white mb-0.5">
                  {shortMonth(m)} {m.split("-")[0]}
                </div>
                <div className="text-gold-400 font-semibold">
                  {nzd(sales[i])} <span className="text-slate-500 font-normal">sales</span>
                </div>
                <div className="text-slate-300 font-semibold">
                  {nzd(expenses[i])} <span className="text-slate-500 font-normal">expenses</span>
                </div>
              </div>
            )}
            <div
              className="w-[38%] max-w-[12px] rounded-t bg-gold-400 transition-all duration-700 ease-out"
              style={{ height: mounted ? `${(sales[i] / max) * 100}%` : "0%" }}
            />
            <div
              className="w-[38%] max-w-[12px] rounded-t bg-slate-500 transition-all duration-700 ease-out"
              style={{ height: mounted ? `${(expenses[i] / max) * 100}%` : "0%" }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 sm:gap-1.5 mt-1.5">
        {months.map((m) => (
          <span key={m} className="flex-1 text-center text-[9px] text-slate-500 font-mono truncate">
            {shortMonth(m)}
          </span>
        ))}
      </div>
    </div>
  );
}

// Diverging bar chart: profit above the baseline in emerald (good), loss below in red (bad) — status color, not identity.
function ProfitChart({ months, values }: { months: string[]; values: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (values.every((v) => v === 0)) {
    return <p className="text-xs text-slate-500 py-10 text-center">No completed sales yet.</p>;
  }

  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const baselinePct = (max / range) * 100;

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <LegendSwatch className="bg-emerald-400" label="Profit" />
        <LegendSwatch className="bg-red-400" label="Loss" />
      </div>
      <div className="relative h-44 sm:h-52 flex gap-1 sm:gap-1.5">
        <div className="absolute left-0 right-0 border-t border-slate-800/80 z-0" style={{ top: `${baselinePct}%` }} />
        {months.map((m, i) => {
          const v = values[i];
          const heightPct = (Math.abs(v) / range) * 100;
          const isPositive = v >= 0;
          return (
            <div
              key={m}
              className="relative flex-1 min-w-0 h-full flex justify-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
              tabIndex={0}
            >
              {hover === i && (
                <div className="absolute bottom-full mb-2 z-10 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-2xl pointer-events-none">
                  <div className="font-bold text-white mb-0.5">
                    {shortMonth(m)} {m.split("-")[0]}
                  </div>
                  <div className={`font-semibold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                    {nzd(v)} {isPositive ? "profit" : "loss"}
                  </div>
                </div>
              )}
              <div
                className={`absolute w-[55%] max-w-[16px] ${isPositive ? "bg-emerald-400" : "bg-red-400"} transition-all duration-700 ease-out`}
                style={{
                  top: isPositive ? `${baselinePct - (mounted ? heightPct : 0)}%` : `${baselinePct}%`,
                  height: mounted ? `${heightPct}%` : "0%",
                  borderRadius: isPositive ? "4px 4px 0 0" : "0 0 4px 4px",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 sm:gap-1.5 mt-1.5">
        {months.map((m) => (
          <span key={m} className="flex-1 text-center text-[9px] text-slate-500 font-mono truncate">
            {shortMonth(m)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard({
  onNavigate,
  newOrders,
  paymentsToCheck,
}: {
  onNavigate: (section: AdminSection) => void;
  newOrders: number;
  paymentsToCheck: number;
}) {
  const attention = [
    newOrders > 0 ? `${newOrders} new shop order${newOrders === 1 ? "" : "s"} to confirm` : "",
    paymentsToCheck > 0 ? `${paymentsToCheck} payment${paymentsToCheck === 1 ? "" : "s"} to check` : "",
  ].filter(Boolean);
  const { getToken } = useAuth();
  const [sales, setSales] = useState<SaleRecord[] | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    void Promise.all([adminApi.listSales(getToken), adminApi.listExpenses(getToken)])
      .then(([s, e]) => {
        setSales(s);
        setExpenses(e);
      })
      .catch((err) => setError((err as Error).message));
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const months = useMemo(() => lastMonths(12), []);

  const stats = useMemo(() => {
    if (!sales || !expenses) return null;
    const completed = sales.filter((s) => s.status === "completed");
    const totalSales = completed.reduce((t, s) => t + s.totals.total, 0);
    const grossProfit = completed.reduce((t, s) => t + (s.profit ?? 0), 0);
    const totalExpenses = expenses.reduce((t, e) => t + e.amountNzd, 0);
    const netProfit = grossProfit - totalExpenses;
    const openOrders = sales.filter((s) => s.status === "open").length;
    const moneyOwing = sales.reduce((t, s) => t + Math.max(0, s.totals.balance), 0);
    const ordersToSend = sales.filter((s) => s.data.shipping.status === "not-sent").length;

    const salesByMonth = months.map((m) =>
      completed.filter((s) => s.orderDate.startsWith(m)).reduce((t, s) => t + s.totals.total, 0)
    );
    const expensesByMonth = months.map((m) =>
      expenses.filter((e) => e.expenseDate.startsWith(m)).reduce((t, e) => t + e.amountNzd, 0)
    );
    const profitByMonth = months.map((m, i) => {
      const monthGross = completed.filter((s) => s.orderDate.startsWith(m)).reduce((t, s) => t + (s.profit ?? 0), 0);
      return monthGross - expensesByMonth[i];
    });

    return {
      totalSales,
      totalExpenses,
      netProfit,
      openOrders,
      moneyOwing,
      ordersToSend,
      salesByMonth,
      expensesByMonth,
      profitByMonth,
    };
  }, [sales, expenses, months]);

  if (error) return <ErrorNote message={error} />;
  if (!stats) return <LoadingSpinner label="Loading overview..." />;

  return (
    <div className="space-y-5">
      {attention.length > 0 && (
        <button
          onClick={() => onNavigate("new-orders")}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 text-left cursor-pointer hover:bg-amber-500/15 transition"
        >
          <Inbox size={16} className="text-amber-300 flex-shrink-0" />
          <span className="flex-1 text-sm font-bold text-amber-200">
            {attention.join(" · ")}
          </span>
          <ChevronRight size={15} className="text-amber-300" />
        </button>
      )}

      {/* Primary financial metrics — leads top-left, matching how the eye scans the page first. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          label="Sales — all time"
          value={stats.totalSales}
          format={nzd}
          icon={<ShoppingBag size={14} />}
          tone="gold"
          trend={stats.salesByMonth}
          onClick={() => onNavigate("sales")}
        />
        <StatTile
          label="Profit — all time"
          value={stats.netProfit}
          format={nzd}
          icon={<PiggyBank size={14} />}
          tone={stats.netProfit >= 0 ? "good" : "bad"}
          trend={stats.profitByMonth}
        />
        <StatTile
          label="Expenses — all time"
          value={stats.totalExpenses}
          format={nzd}
          icon={<Receipt size={14} />}
          tone="slate"
          trend={stats.expensesByMonth}
          onClick={() => onNavigate("expenses")}
        />
      </div>

      {/* Operational status — supporting detail, what needs attention right now. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          label="Open orders"
          value={stats.openOrders}
          format={(n) => String(Math.round(n))}
          icon={<Clock size={14} />}
          tone={stats.openOrders > 0 ? "warn" : "good"}
          onClick={() => onNavigate("sales")}
        />
        <StatTile
          label="Money owing"
          value={stats.moneyOwing}
          format={nzd}
          icon={<Wallet size={14} />}
          tone={stats.moneyOwing > 0.004 ? "warn" : "good"}
          onClick={() => onNavigate("sales")}
        />
        <StatTile
          label="Orders to send"
          value={stats.ordersToSend}
          format={(n) => String(Math.round(n))}
          icon={<Truck size={14} />}
          tone={stats.ordersToSend > 0 ? "warn" : "good"}
          onClick={() => onNavigate("sales")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Sales vs expenses — last 12 months">
          <SalesExpensesChart months={months} sales={stats.salesByMonth} expenses={stats.expensesByMonth} />
        </Card>

        <Card title="Profit by month — last 12 months">
          <ProfitChart months={months} values={stats.profitByMonth} />
        </Card>
      </div>
    </div>
  );
}
