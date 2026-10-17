import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { Archive, ArchiveRestore, ArrowLeft, MessageCircle, PenSquare, Search } from "lucide-react";
import ChatThread from "../ChatThread";
import { adminApi, type CustomerSummary } from "../../lib/adminApi";
import { formatDateTime } from "../../lib/locale";
import type { Conversation } from "../../../shared/shop";
import { ErrorNote, inputClass, primaryButton, secondaryButton } from "./ui";
import { Spinner } from "../LoadingSpinner";

// Admin -> Messages: every customer conversation (unread first in mind, newest first), one open at a time. The
// owner can reply, start a conversation with any customer, and archive finished ones (a new message from the
// customer brings it back).

const INBOX_REFRESH_MS = 15_000;

const when = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? formatDateTime(iso, { hour: "numeric", minute: "2-digit" })
    : formatDateTime(iso, { day: "numeric", month: "short" });
};

export default function MessagesView({
  initialCustomerId,
  onUnreadChanged,
}: {
  initialCustomerId: string | null;
  onUnreadChanged: () => void;
}) {
  const { getToken } = useAuth();
  const [list, setList] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialCustomerId);
  const [picking, setPicking] = useState(false);

  const loadList = useCallback(async () => {
    try {
      setList((await adminApi.conversations(getToken)).conversations);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    void loadList();
    const timer = window.setInterval(() => document.visibilityState === "visible" && void loadList(), INBOX_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadList]);

  useEffect(() => {
    if (initialCustomerId) setOpenId(initialCustomerId);
  }, [initialCustomerId]);

  const shown = (list ?? []).filter((c) => c.archived === showArchived);
  const archivedCount = (list ?? []).filter((c) => c.archived).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      {/* Inbox (hidden on a phone while a conversation is open) */}
      <div className={`${openId ? "hidden lg:block" : ""} space-y-3`}>
        <div className="flex items-center gap-2">
          <button className={primaryButton} onClick={() => setPicking(true)}>
            <PenSquare size={13} /> New message
          </button>
          {(archivedCount > 0 || showArchived) && (
            <button className={secondaryButton} onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Inbox" : `Archived (${archivedCount})`}
            </button>
          )}
        </div>
        <ErrorNote message={error} />
        {picking && (
          <CustomerPicker
            onPick={(id) => {
              setPicking(false);
              setOpenId(id);
            }}
            onCancel={() => setPicking(false)}
          />
        )}
        <div className="overflow-hidden rounded-2xl border border-slate-800 divide-y divide-slate-800/80">
          {list == null ? (
            <div className="flex justify-center py-8">
              <Spinner size={16} className="text-gold-400" />
            </div>
          ) : shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              {showArchived ? "No archived conversations." : "No messages yet. Customers can message you from anywhere in your shop."}
            </p>
          ) : (
            shown.map((c) => (
              <button
                key={c.customerId}
                onClick={() => setOpenId(c.customerId)}
                className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition ${
                  openId === c.customerId ? "bg-gold-500/10" : "bg-slate-900/30 hover:bg-slate-900/70"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={`truncate text-sm ${c.unread ? "font-black text-white" : "font-bold text-slate-200"}`}>{c.customerName}</span>
                    <span className="ml-auto flex-shrink-0 text-[10px] text-slate-500">{when(c.lastMessage.createdAt)}</span>
                  </div>
                  <p className={`truncate text-xs ${c.unread ? "text-slate-200" : "text-slate-500"}`}>
                    {c.lastMessage.from === "owner" && "You: "}
                    {c.lastMessage.body}
                  </p>
                </div>
                {c.unread > 0 && (
                  <span className="mt-0.5 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-black tabular-nums">
                    {c.unread}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* The open conversation */}
      <div className={`${openId ? "" : "hidden lg:flex"} min-h-0`}>
        {openId ? (
          <OpenConversation
            key={openId}
            customerId={openId}
            onBack={() => setOpenId(null)}
            onChanged={() => {
              void loadList();
              onUnreadChanged();
            }}
          />
        ) : (
          <div className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-16 text-center">
            <MessageCircle size={22} className="text-slate-600" />
            <p className="mt-2 text-sm text-slate-500">Pick a conversation, or start a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function OpenConversation({ customerId, onBack, onChanged }: { customerId: string; onBack: () => void; onChanged: () => void }) {
  const { getToken } = useAuth();
  const [customer, setCustomer] = useState<{ name: string; email: string; archived: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await adminApi.conversation(customerId, getToken);
    setCustomer(result.customer);
    return result.messages;
  }, [customerId, getToken]);
  const send = useCallback(
    async (body: string) => {
      const { message } = await adminApi.sendMessage(customerId, body, getToken);
      onChanged();
      return message;
    },
    [customerId, getToken, onChanged]
  );
  const markRead = useCallback(() => adminApi.markMessagesRead(customerId, getToken), [customerId, getToken]);

  const toggleArchive = async () => {
    if (!customer) return;
    setBusy(true);
    try {
      await adminApi.archiveConversation(customerId, !customer.archived, getToken);
      setCustomer({ ...customer, archived: !customer.archived });
      onChanged();
      if (!customer.archived) onBack();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[min(42rem,calc(100dvh-12rem))] w-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30">
      <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
        <button className="cursor-pointer text-slate-400 hover:text-white lg:hidden" onClick={onBack} aria-label="Back to messages">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">{customer?.name ?? " "}</p>
          <p className="truncate text-[11px] text-slate-500">{customer?.email || " "}</p>
        </div>
        {customer && (
          <button className={secondaryButton} disabled={busy} onClick={() => void toggleArchive()}>
            {customer.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {customer.archived ? "Unarchive" : "Archive"}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <ChatThread
          me="owner"
          otherName={customer?.name.split(" ")[0] || "customer"}
          load={load}
          send={send}
          markRead={markRead}
          onRead={onChanged}
          emptyText="No messages yet - send the first one."
        />
      </div>
    </div>
  );
}

// Choosing who to start a conversation with.
function CustomerPicker({ onPick, onCancel }: { onPick: (customerId: string) => void; onCancel: () => void }) {
  const { getToken } = useAuth();
  const [all, setAll] = useState<CustomerSummary[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    adminApi.listCustomers(getToken).then(setAll).catch(() => setAll([]));
  }, [getToken]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (all ?? [])
      // Only customers with a login can read messages.
      .filter((c) => c.hasLogin)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [all, search]);

  return (
    <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input autoFocus className={`${inputClass} pl-8`} placeholder="Find a customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {all == null ? (
        <Spinner size={14} className="text-gold-400" />
      ) : matches.length === 0 ? (
        <p className="text-xs text-slate-500">No customers match. Only customers who have signed up in your shop can get messages.</p>
      ) : (
        <div className="space-y-1">
          {matches.map((c) => (
            <button
              key={c.id}
              className="block w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800"
              onClick={() => onPick(c.id)}
            >
              {c.name} <span className="text-xs text-slate-500">{c.email}</span>
            </button>
          ))}
        </div>
      )}
      <button className="text-xs text-slate-400 hover:text-white cursor-pointer" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
