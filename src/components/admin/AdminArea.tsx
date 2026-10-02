import React from "react";
import { Lock } from "lucide-react";
import AdminDashboard from "./AdminDashboard";
import SalesView from "./SalesView";
import OrdersView from "./OrdersView";
import InventoryView from "./InventoryView";
import ExpensesView from "./ExpensesView";

export type AdminSection = "overview" | "sales" | "peptide-orders" | "supply-orders" | "inventory" | "expenses";

const SECTION_COPY: Record<AdminSection, { title: string; description: string }> = {
  overview: { title: "Admin", description: "Your business at a glance. Only visible to you." },
  sales: { title: "Customer Orders", description: "Every order a customer has placed, its payment and shipping status." },
  "peptide-orders": { title: "Peptide Orders", description: "Every peptide order you've placed, with its landed cost per vial worked out in NZD." },
  "supply-orders": {
    title: "Supply Orders",
    description: "Pens, needles, swabs and other stock — plus business items bought on the same invoice (mark those lines as Expense).",
  },
  inventory: { title: "Inventory", description: "Stock on hand, valued at cost, with batch and expiry tracking." },
  expenses: { title: "Expenses", description: "Business costs outside of supply orders — equipment, software, marketing and more." },
};

// Owner-only business area. Loaded lazily so regular users never download it.
// Navigation lives in the sidebar (see App.tsx); this just renders whichever section is active.
export default function AdminArea({ section, onNavigate }: { section: AdminSection; onNavigate: (section: AdminSection) => void }) {
  const copy = SECTION_COPY[section];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
          <Lock size={16} className="text-gold-400" /> {copy.title}
        </h2>
        <p className="text-sm text-slate-400">{copy.description}</p>
      </div>

      {section === "overview" && <AdminDashboard onNavigate={onNavigate} />}
      {section === "sales" && <SalesView />}
      {section === "peptide-orders" && <OrdersView key="peptides" orderType="peptides" />}
      {section === "supply-orders" && <OrdersView key="supplies" orderType="supplies" />}
      {section === "inventory" && <InventoryView />}
      {section === "expenses" && <ExpensesView />}
    </div>
  );
}
