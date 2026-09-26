import React, { useState } from "react";
import { Boxes, FlaskConical, Lock, Receipt, ShoppingBag, Truck } from "lucide-react";
import SalesView from "./SalesView";
import OrdersView from "./OrdersView";
import InventoryView from "./InventoryView";
import ExpensesView from "./ExpensesView";

type AdminSection = "sales" | "peptide-orders" | "supply-orders" | "inventory" | "expenses";

const SECTIONS: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  { id: "sales", label: "Customer Orders", icon: <ShoppingBag size={13} /> },
  { id: "peptide-orders", label: "Peptide Orders", icon: <FlaskConical size={13} /> },
  { id: "supply-orders", label: "Supply Orders", icon: <Truck size={13} /> },
  { id: "inventory", label: "Inventory", icon: <Boxes size={13} /> },
  { id: "expenses", label: "Expenses", icon: <Receipt size={13} /> },
];

// Owner-only business area. Loaded lazily so regular users never download it.
export default function AdminArea() {
  const [section, setSection] = useState<AdminSection>("sales");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
          <Lock size={16} className="text-gold-400" /> Admin
        </h2>
        <p className="text-sm text-slate-400">Your customer orders, peptide and supply orders, stock and expenses. Only visible to you.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-800/80 pb-3 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border transition cursor-pointer whitespace-nowrap ${
              section === s.id
                ? "border-gold-500/60 text-gold-400"
                : "border-transparent text-slate-400 hover:text-white hover:bg-slate-900/40"
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      {section === "sales" && <SalesView />}
      {section === "peptide-orders" && <OrdersView key="peptides" orderType="peptides" />}
      {section === "supply-orders" && <OrdersView key="supplies" orderType="supplies" />}
      {section === "inventory" && <InventoryView />}
      {section === "expenses" && <ExpensesView />}
    </div>
  );
}
