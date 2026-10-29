import React, { useCallback, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { MessageCircle, X } from "lucide-react";
import ChatThread from "./ChatThread";
import { CustomerMessageNotify } from "./MessageNotifyPrompt";
import { shopApi } from "../lib/shopApi";
import type { MessageUpload } from "../lib/fileData";

// A customer's conversation with their shop, opened from the Messages button anywhere in the app (or from an
// order's "Ask about this order"). A window in the middle of the screen; fills the screen on a phone.
export default function MessagesPanel({
  shopName,
  shopLogo,
  order,
  onClearOrder,
  onClose,
  onRead,
}: {
  shopName: string;
  shopLogo: string | null;
  order: { id: string; number: number } | null;
  onClearOrder: () => void;
  onClose: () => void;
  onRead: () => void;
}) {
  const { getToken } = useAuth();
  const load = useCallback(async () => (await shopApi.messages(getToken)).messages, [getToken]);
  const send = useCallback(
    async (body: string, shopOrderId: string | null, attachment: MessageUpload | null) =>
      (await shopApi.sendMessage(body, shopOrderId, attachment, getToken)).message,
    [getToken]
  );
  const loadFile = useCallback((messageId: string) => shopApi.messageFile(messageId, getToken), [getToken]);
  const markRead = useCallback(() => shopApi.markMessagesRead(getToken), [getToken]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label={`Messages with ${shopName}`}>
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default" aria-label="Close messages" onClick={onClose} />
      <div className="theme-keep-bg relative flex h-full w-full flex-col overflow-hidden bg-[#121215] shadow-2xl sm:h-[min(40rem,85dvh)] sm:w-[34rem] sm:rounded-2xl sm:border sm:border-slate-800">
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3.5">
          {shopLogo ? (
            <img src={shopLogo} alt="" className="h-8 w-8 rounded object-contain" />
          ) : (
            <MessageCircle size={20} className="text-gold-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-white">{shopName}</p>
            <p className="text-[11px] text-slate-500">Messages · we'll reply here</p>
          </div>
          <button className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <CustomerMessageNotify shopName={shopName} className="mx-3 mt-3" />
        <div className="min-h-0 flex-1">
          <ChatThread
            me="customer"
            otherName={shopName}
            load={load}
            send={send}
            loadFile={loadFile}
            markRead={markRead}
            order={order}
            onClearOrder={onClearOrder}
            onRead={onRead}
            emptyText={`Got a question? Send ${shopName} a message - about an order, a product, or anything else.`}
          />
        </div>
      </div>
    </div>
  );
}
