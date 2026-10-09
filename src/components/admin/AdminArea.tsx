import React, { useState } from "react";
import { Lock } from "lucide-react";
import AdminDashboard from "./AdminDashboard";
import SalesView from "./SalesView";
import ShopOrdersView from "./ShopOrdersView";
import CustomersView from "./CustomersView";
import OrdersView from "./OrdersView";
import InventoryView from "./InventoryView";
import ExpensesView from "./ExpensesView";
import PaymentDetailsView from "./PaymentDetailsView";
import PriceListView from "./PriceListView";
import BusinessSettingsView from "./BusinessSettingsView";
import type { BusinessContext } from "../../lib/business";

export type AdminSection =
  | "overview"
  | "new-orders"
  | "sales"
  | "customers"
  | "peptide-orders"
  | "supply-orders"
  | "inventory"
  | "expenses"
  | "payment-details"
  | "business"
  | "price-list";

const SECTION_COPY: Record<AdminSection, { title: string; description: string }> = {
  overview: { title: "Admin", description: "Your business at a glance. Only visible to you." },
  "new-orders": {
    title: "New Customer Orders",
    description: "Orders customers have sent from the shop. Check stock, set shipping, then confirm or decline.",
  },
  sales: { title: "Customer Orders", description: "Every order a customer has placed, its payment and shipping status." },
  customers: { title: "Customers", description: "Everyone you sell to: contact details, shipping address and order history." },
  "peptide-orders": { title: "Peptide Orders", description: "Every peptide order you've placed, with its landed cost per vial worked out in NZD." },
  "supply-orders": {
    title: "Supply Orders",
    description: "Pens, needles, swabs and other stock — plus business items bought on the same invoice (mark those lines as Expense).",
  },
  inventory: { title: "Inventory", description: "Stock on hand, valued at cost, with batch and expiry tracking." },
  expenses: { title: "Expenses", description: "Business costs outside of supply orders — equipment, software, marketing and more." },
  "payment-details": {
    title: "Payment Details",
    description: "The bank account customers pay into. They only see it once you've confirmed their order.",
  },
  business: {
    title: "Business",
    description: "Your business name and logo, the link that brings customers to your shop, and your PepBiz subscription.",
  },
  "price-list": {
    title: "Vendor Price List",
    description: "Your supplier's products and prices, ready to pick when you enter a peptide order.",
  },
};

// Owner-only business area. Loaded lazily so regular users never download it.
// Navigation lives in the sidebar (see App.tsx); this just renders whichever section is active.
export default function AdminArea({
  section,
  onNavigate,
  newOrders,
  paymentsToCheck,
  onOrdersChanged,
  business,
  onBusinessChanged,
}: {
  section: AdminSection;
  onNavigate: (section: AdminSection) => void;
  newOrders: number; // shop orders waiting to be confirmed
  paymentsToCheck: number; // confirmed orders the customer says they've paid
  onOrdersChanged: () => void;
  business: BusinessContext;
  onBusinessChanged: () => void;
}) {
  const copy = SECTION_COPY[section];
  // An order picked from a customer's page (or a confirmed shop order), opened once Customer Orders loads.
  const [openSaleId, setOpenSaleId] = useState<string | null>(null);
  const openSale = (saleId: string) => {
    setOpenSaleId(saleId);
    onNavigate("sales");
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
          <Lock size={16} className="text-gold-400" /> {copy.title}
        </h2>
        <p className="text-sm text-slate-400">{copy.description}</p>
      </div>

      {section === "overview" && <AdminDashboard onNavigate={onNavigate} newOrders={newOrders} paymentsToCheck={paymentsToCheck} />}
      {section === "new-orders" && <ShopOrdersView
          onOpenSale={openSale}
          onChanged={onOrdersChanged}
          onSetUpPayment={() => onNavigate("payment-details")}
        />}
      {section === "sales" && <SalesView openSaleId={openSaleId} onOpened={() => setOpenSaleId(null)} />}
      {section === "customers" && <CustomersView onOpenSale={openSale} />}
      {section === "peptide-orders" && <OrdersView key="peptides" orderType="peptides" />}
      {section === "supply-orders" && <OrdersView key="supplies" orderType="supplies" />}
      {section === "inventory" && <InventoryView />}
      {section === "expenses" && <ExpensesView />}
      {section === "payment-details" && <PaymentDetailsView />}
      {section === "business" && <BusinessSettingsView context={business} onChanged={onBusinessChanged} />}
      {section === "price-list" && <PriceListView />}
    </div>
  );
}
