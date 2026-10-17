import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Package, Send, X } from "lucide-react";
import { MAX_MESSAGE_LENGTH, type ChatMessage } from "../../shared/shop";
import { formatDateTime } from "../lib/locale";
import { Spinner } from "./LoadingSpinner";

// One conversation between a shop and a customer, used by both: the customer's Messages panel and the owner's
// Messages page. Checks for new messages every few seconds while it's open, and marks the other side's
// messages read whenever new ones arrive.

const POLL_MS = 5000;

export default function ChatThread({
  me,
  otherName,
  load,
  send,
  markRead,
  order,
  onClearOrder,
  emptyText,
  onRead,
}: {
  me: "customer" | "owner";
  otherName: string;
  load: () => Promise<ChatMessage[]>;
  send: (body: string, shopOrderId: string | null) => Promise<ChatMessage>;
  markRead: () => Promise<unknown>;
  order?: { id: string; number: number } | null; // the next message is about this order
  onClearOrder?: () => void;
  emptyText: string;
  onRead?: () => void; // after the other side's messages were marked read (e.g. to refresh a badge)
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const lastUnreadId = useRef<string | null>(null);
  // The latest callbacks, without restarting the regular check whenever the page around this re-renders.
  const calls = useRef({ load, markRead, onRead });
  calls.current = { load, markRead, onRead };

  const refresh = useCallback(async () => {
    try {
      const list = await calls.current.load();
      setMessages(list);
      // Mark the other side's new messages read (once per new message).
      const unread = list.filter((m) => m.from !== me && !m.read);
      const newest = unread[unread.length - 1]?.id ?? null;
      if (newest && newest !== lastUnreadId.current) {
        lastUnreadId.current = newest;
        await calls.current.markRead().catch(() => {});
        calls.current.onRead?.();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [me]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => document.visibilityState === "visible" && void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await send(body, order?.id ?? null);
      setMessages((list) => [...(list ?? []), sent]);
      setDraft("");
      onClearOrder?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {messages == null ? (
          <div className="flex justify-center py-10">
            <Spinner size={18} className="text-gold-400" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">{emptyText}</p>
        ) : (
          messages.map((m, i) => {
            const mine = m.from === me;
            const showDay =
              i === 0 || new Date(messages[i - 1].createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            return (
              <React.Fragment key={m.id}>
                {showDay && (
                  <p className="pt-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-600">
                    {formatDateTime(m.createdAt, { weekday: "short", day: "numeric", month: "short" })}
                  </p>
                )}
                <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      mine ? "bg-gold-500/15 border border-gold-500/40 text-slate-100 rounded-br-md" : "theme-keep-bg bg-[#2a2a31] text-slate-100 rounded-bl-md"
                    }`}
                  >
                    {m.orderNumber != null && (
                      <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gold-300">
                        <Package size={11} /> About order #{m.orderNumber}
                      </span>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <span className="mt-1 block text-right text-[10px] text-slate-500">
                      {!mine && <span className="mr-1">{otherName} ·</span>}
                      {formatDateTime(m.createdAt, { hour: "numeric", minute: "2-digit" })}
                      {mine && m.read && <span className="ml-1">· Seen</span>}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>

      <div className="border-t border-slate-800 px-3 py-3 space-y-2">
        {error && <p className="text-xs text-red-400">{error}</p>}
        {order && (
          <div className="flex items-center gap-2 rounded-lg border border-gold-500/30 bg-gold-500/10 px-2.5 py-1.5 text-xs text-gold-300">
            <Package size={12} /> About order #{order.number}
            {onClearOrder && (
              <button className="ml-auto cursor-pointer text-slate-400 hover:text-white" onClick={onClearOrder} aria-label="Not about this order">
                <X size={13} />
              </button>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter starts a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={Math.min(5, Math.max(1, draft.split("\n").length))}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={`Message ${otherName}...`}
            className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-gold-500/70"
          />
          <button
            className="theme-keep-bg flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl bg-gold-500 disabled:opacity-40"
            disabled={!draft.trim() || sending}
            onClick={() => void submit()}
            aria-label="Send"
          >
            {sending ? <Spinner size={14} /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
