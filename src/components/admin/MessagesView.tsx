import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { Archive, ArchiveRestore, ArrowLeft, CheckCircle2, Megaphone, MessageCircle, PenSquare, Search, Send, Users } from "lucide-react";
import ChatThread from "../ChatThread";
import { OwnerMessageNotify } from "../MessageNotifyPrompt";
import { adminApi, type CustomerSummary } from "../../lib/adminApi";
import type { MessageUpload } from "../../lib/fileData";
import { formatDateTime } from "../../lib/locale";
import { MAX_GROUP_RECIPIENTS, MAX_MESSAGE_LENGTH, type Conversation } from "../../../shared/shop";
import { ErrorNote, inputClass, primaryButton, secondaryButton } from "./ui";
import { Spinner } from "../LoadingSpinner";

// Admin -> Messages: every customer conversation (unread first in mind, newest first), one open at a time. The
// owner can reply, start a conversation with any customer, send one message to several customers (each gets it
// privately in their own conversation), and archive finished ones (a new message from the customer brings it back).

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
  // Writing one message to chosen customers or to all of them (shown where a conversation would be).
  const [grouping, setGrouping] = useState<null | "chosen" | "all">(null);
  const open = (customerId: string) => {
    setGrouping(null);
    setOpenId(customerId);
  };
  const startGroup = (to: "chosen" | "all") => {
    setPicking(false);
    setOpenId(null);
    setGrouping(to);
  };

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
    if (initialCustomerId) open(initialCustomerId);
  }, [initialCustomerId]);

  const shown = (list ?? []).filter((c) => c.archived === showArchived);
  const archivedCount = (list ?? []).filter((c) => c.archived).length;

  return (
    <div className="space-y-4">
      {/* Across the top, so all three fit on one line (the inbox column is too narrow). Hidden on a phone while a
          conversation is open, like the inbox. */}
      <div className={`${openId || grouping ? "hidden lg:flex" : "flex"} flex-wrap items-center gap-2`}>
        <button className={primaryButton} onClick={() => setPicking(true)}>
          <PenSquare size={13} /> New message
        </button>
        <button className={secondaryButton} onClick={() => startGroup("chosen")}>
          <Users size={13} /> Message several
        </button>
        <button className={secondaryButton} onClick={() => startGroup("all")}>
          <Megaphone size={13} /> Message all
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Inbox (hidden on a phone while a conversation is open) */}
        <div className={`${openId || grouping ? "hidden lg:block" : ""} space-y-3`}>
          {(archivedCount > 0 || showArchived) && (
            <button className={secondaryButton} onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Inbox" : `Archived (${archivedCount})`}
            </button>
          )}
          <OwnerMessageNotify />
          <ErrorNote message={error} />
          {picking && (
            <CustomerPicker
              onPick={(id) => {
                setPicking(false);
                open(id);
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
                  onClick={() => open(c.customerId)}
                  className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition ${
                    openId === c.customerId && !grouping ? "bg-gold-500/10" : "bg-slate-900/30 hover:bg-slate-900/70"
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
        <div className={`${openId || grouping ? "" : "hidden lg:flex"} min-h-0`}>
          {grouping ? (
            <GroupMessage
              key={grouping}
              toAll={grouping === "all"}
              onClose={() => setGrouping(null)}
              onSent={() => {
                void loadList();
                onUnreadChanged();
              }}
            />
          ) : openId ? (
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
    async (body: string, _shopOrderId: string | null, attachment: MessageUpload | null) => {
      const { message } = await adminApi.sendMessage(customerId, body, attachment, getToken);
      onChanged();
      return message;
    },
    [customerId, getToken, onChanged]
  );
  const loadFile = useCallback((messageId: string) => adminApi.messageFile(messageId, getToken), [getToken]);
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
          loadFile={loadFile}
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

// One message to chosen customers, or (toAll) to every customer. Each gets their own copy in their own conversation,
// so nobody sees who else got it, and replies come back to the inbox as usual. Only customers who've signed up in the
// shop can get messages.
function GroupMessage({ toAll, onClose, onSent }: { toAll: boolean; onClose: () => void; onSent: () => void }) {
  const { getToken } = useAuth();
  const [all, setAll] = useState<CustomerSummary[] | null>(null);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<number | null>(null);

  useEffect(() => {
    adminApi
      .listCustomers(getToken)
      .then((rows) => setAll([...rows].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => setError((e as Error).message));
  }, [getToken]);

  const reachable = useMemo(() => (all ?? []).filter((c) => c.hasLogin), [all]);
  const noLogin = (all ?? []).length - reachable.length;
  const q = search.trim().toLowerCase();
  const matches = q
    ? reachable.filter((c) => c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q))
    : reachable;
  const allMatchesChosen = matches.length > 0 && matches.every((c) => chosen.has(c.id));
  const tooMany = !toAll && chosen.size > MAX_GROUP_RECIPIENTS;
  const count = toAll ? reachable.length : chosen.size;
  const customersText = (n: number) => `${n} customer${n === 1 ? "" : "s"}`;

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Select all / none of the customers shown (all of them, or those matching the search).
  const toggleMatches = () =>
    setChosen((current) => {
      const next = new Set(current);
      for (const c of matches) {
        if (allMatchesChosen) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });

  const send = async () => {
    const who = toAll ? `all ${customersText(count)} who've signed up in your shop` : customersText(count);
    if (!window.confirm(`Send this message to ${who}? Each gets it privately.`)) return;
    setBusy(true);
    setError(null);
    try {
      const { sent } = await adminApi.sendGroupMessage(toAll ? "all" : Array.from(chosen), body, getToken);
      setSentTo(sent);
      setChosen(new Set());
      setBody("");
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[min(42rem,calc(100dvh-12rem))] w-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30">
      <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
        <button className="cursor-pointer text-slate-400 hover:text-white" onClick={onClose} aria-label="Back to messages">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">{toAll ? "Message all customers" : "Message several customers"}</p>
          <p className="truncate text-[11px] text-slate-500">Each customer gets it privately, in their own conversation with you.</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        <ErrorNote message={error} />
        {sentTo != null && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 size={13} /> Sent to {sentTo} customer{sentTo === 1 ? "" : "s"}. Their replies will appear in your inbox.
          </p>
        )}

        {toAll ? (
          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-white">To</span>
            {all == null && !error ? (
              <Spinner size={14} className="text-gold-400" />
            ) : (
              <p className="text-sm text-slate-200">
                {reachable.length === 0
                  ? "None of your customers have signed up in your shop yet."
                  : `All ${customersText(reachable.length)} who've signed up in your shop`}
              </p>
            )}
            {noLogin > 0 && (
              <p className="text-[11px] text-slate-500">
                {customersText(noLogin)} {noLogin === 1 ? "hasn't" : "haven't"} signed up, so won't get it - only customers with a
                login can read messages.
              </p>
            )}
          </div>
        ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-white">To</span>
            <span className={`text-[11px] tabular-nums ${tooMany ? "text-red-400 font-bold" : "text-slate-500"}`}>
              {chosen.size} selected{tooMany ? ` - up to ${MAX_GROUP_RECIPIENTS} at a time (use Message all to reach everyone)` : ""}
            </span>
            {matches.length > 0 && (
              <button className="ml-auto text-[11px] font-bold text-gold-400 hover:text-gold-300 cursor-pointer" onClick={toggleMatches}>
                {allMatchesChosen ? "Select none" : q ? `Select all ${matches.length} found` : "Select all"}
              </button>
            )}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className={`${inputClass} pl-8`} placeholder="Find a customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {all == null && !error ? (
            <Spinner size={14} className="text-gold-400" />
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/70">
              {matches.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-500">
                  {reachable.length === 0 ? "None of your customers have signed up in your shop yet." : "No customers match."}
                </p>
              ) : (
                matches.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-900/70">
                    <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className="min-w-0 truncate text-slate-200">
                      {c.name} <span className="text-xs text-slate-500">{c.email}</span>
                    </span>
                  </label>
                ))
              )}
            </div>
          )}
          {noLogin > 0 && (
            <p className="text-[11px] text-slate-500">
              {noLogin} customer{noLogin === 1 ? " hasn't" : "s haven't"} signed up in your shop, so {noLogin === 1 ? "isn't" : "aren't"} listed -
              only customers with a login can read messages.
            </p>
          )}
        </div>
        )}

        <div className="space-y-1">
          <span className="block text-[11px] font-bold text-white">Message</span>
          <textarea
            className={`${inputClass} min-h-[7rem] resize-y`}
            value={body}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(e) => {
              setBody(e.target.value);
              setSentTo(null);
            }}
            placeholder="e.g. BPC-157 is back in stock this week."
          />
          <span className="block text-right text-[10px] text-slate-500 tabular-nums">
            {body.length}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>
      </div>

      <div className="border-t border-slate-800 px-4 py-3">
        <button className={primaryButton} disabled={busy || count === 0 || tooMany || !body.trim()} onClick={() => void send()}>
          {busy ? <Spinner size={13} /> : <Send size={13} />}{" "}
          {toAll
            ? `Send to all ${customersText(count)}`
            : chosen.size === 0
              ? "Choose who to send it to"
              : `Send to ${customersText(chosen.size)}`}
        </button>
      </div>
    </div>
  );
}
