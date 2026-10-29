import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Package, Paperclip, Send, X } from "lucide-react";
import { MAX_MESSAGE_FILE_BYTES, MAX_MESSAGE_LENGTH, type ChatMessage } from "../../shared/shop";
import { prepareImage, readAsDataUrl, type MessageUpload } from "../lib/fileData";
import { formatDateTime } from "../lib/locale";
import { Spinner } from "./LoadingSpinner";

// One conversation between a shop and a customer, used by both: the customer's Messages panel and the owner's
// Messages page. Checks for new messages every few seconds while it's open, and marks the other side's
// messages read whenever new ones arrive. A message can carry one photo or PDF.

const POLL_MS = 5000;
// Photos are shrunk to this on their longest side before sending - plenty to read a label or see a reaction.
const PHOTO_EDGE = 2000;

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

async function toUpload(file: File): Promise<MessageUpload> {
  if (isPdf(file)) {
    if (file.size > MAX_MESSAGE_FILE_BYTES) throw new Error("That PDF is too large (3 MB at most).");
    const dataUrl = (await readAsDataUrl(file)).replace(/^data:[^;]*;/, "data:application/pdf;");
    return { dataUrl, name: file.name };
  }
  if (!file.type.startsWith("image/")) throw new Error("You can send photos and PDFs.");
  try {
    return { dataUrl: await prepareImage(file, PHOTO_EDGE), name: file.name };
  } catch {
    throw new Error("That photo couldn't be read - try a JPEG or PNG.");
  }
}

const fileSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// Files already fetched this visit, so the regular check for new messages doesn't fetch them again.
const fileUrls = new Map<string, string>();

function Attachment({ message, loadFile }: { message: ChatMessage; loadFile: (messageId: string) => Promise<Blob> }) {
  const a = message.attachment!;
  const pdf = a.type === "application/pdf";
  const [url, setUrl] = useState(() => fileUrls.get(message.id) ?? null);
  const [failed, setFailed] = useState(false);

  const fetchUrl = useCallback(async () => {
    const known = fileUrls.get(message.id);
    if (known) return known;
    const made = URL.createObjectURL(await loadFile(message.id));
    fileUrls.set(message.id, made);
    return made;
  }, [message.id, loadFile]);

  // Photos are shown in the conversation, so they're fetched straight away. PDFs only when opened.
  useEffect(() => {
    if (pdf || url) return;
    fetchUrl().then(setUrl, () => setFailed(true));
  }, [pdf, url, fetchUrl]);

  if (pdf) {
    const open = async () => {
      // Open the tab while the tap still counts, then point it at the file (phones block tabs opened later).
      const tab = window.open("", "_blank");
      try {
        const href = await fetchUrl();
        if (tab) {
          tab.location.href = href;
        } else {
          // No new tab allowed: save it instead.
          const link = document.createElement("a");
          link.href = href;
          link.download = a.name;
          link.click();
        }
      } catch {
        tab?.close();
        setFailed(true);
      }
    };
    return (
      <button
        type="button"
        onClick={() => void open()}
        className="mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-left hover:border-slate-500"
      >
        <FileText size={20} className="flex-shrink-0 text-red-300" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{a.name}</span>
          <span className="block text-[11px] text-slate-400">{failed ? "Couldn't open - tap to try again" : `PDF · ${fileSize(a.size)}`}</span>
        </span>
      </button>
    );
  }

  if (failed) {
    return (
      <span className="mb-1 flex items-center gap-2 text-xs text-slate-400">
        <ImageIcon size={14} /> Photo couldn't be loaded
      </span>
    );
  }
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mb-1 block">
      <img src={url} alt={a.name} className="max-h-64 max-w-full rounded-xl object-contain" />
    </a>
  ) : (
    <span className="mb-1 flex h-32 w-40 items-center justify-center rounded-xl bg-slate-950/50">
      <Spinner size={16} className="text-gold-400" />
    </span>
  );
}

export default function ChatThread({
  me,
  otherName,
  load,
  send,
  loadFile,
  markRead,
  order,
  onClearOrder,
  emptyText,
  onRead,
}: {
  me: "customer" | "owner";
  otherName: string;
  load: () => Promise<ChatMessage[]>;
  send: (body: string, shopOrderId: string | null, attachment: MessageUpload | null) => Promise<ChatMessage>;
  loadFile: (messageId: string) => Promise<Blob>; // a photo/PDF sent in the conversation
  markRead: () => Promise<unknown>;
  order?: { id: string; number: number } | null; // the next message is about this order
  onClearOrder?: () => void;
  emptyText: string;
  onRead?: () => void; // after the other side's messages were marked read (e.g. to refresh a badge)
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
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

  const pick = (chosen: File | undefined) => {
    if (!chosen) return;
    if (!isPdf(chosen) && !chosen.type.startsWith("image/")) {
      setError("You can send photos and PDFs.");
      return;
    }
    if (isPdf(chosen) && chosen.size > MAX_MESSAGE_FILE_BYTES) {
      setError("That PDF is too large (3 MB at most).");
      return;
    }
    setError(null);
    setFile(chosen);
  };

  const submit = async () => {
    const body = draft.trim();
    if ((!body && !file) || sending) return;
    setSending(true);
    setError(null);
    try {
      const attachment = file ? await toUpload(file) : null;
      const sent = await send(body, order?.id ?? null, attachment);
      setMessages((list) => [...(list ?? []), sent]);
      setDraft("");
      setFile(null);
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
                    {m.attachment && <Attachment message={m} loadFile={loadFile} />}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
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
        {file && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300">
            {isPdf(file) ? <FileText size={13} className="text-red-300" /> : <ImageIcon size={13} className="text-gold-300" />}
            <span className="min-w-0 truncate font-bold text-white">{file.name}</span>
            <span className="text-slate-500">{isPdf(file) ? fileSize(file.size) : "Photo"}</span>
            <button
              className="ml-auto cursor-pointer text-slate-400 hover:text-white"
              onClick={() => setFile(null)}
              disabled={sending}
              aria-label="Don't send this file"
            >
              <X size={13} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={picker}
            type="file"
            accept="image/*,application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = ""; // so the same file can be picked again
            }}
          />
          <button
            className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-40"
            onClick={() => picker.current?.click()}
            disabled={sending}
            aria-label="Attach a photo or PDF"
            title="Attach a photo or PDF"
          >
            <Paperclip size={16} />
          </button>
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
            disabled={(!draft.trim() && !file) || sending}
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
