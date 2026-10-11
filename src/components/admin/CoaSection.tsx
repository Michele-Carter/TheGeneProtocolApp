import React, { useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { ExternalLink, FileUp, Link2, Trash2 } from "lucide-react";
import { MAX_COA_BYTES } from "../../../shared/shop";
import { adminApi, type InvItem } from "../../lib/adminApi";
import { ErrorNote, inputClass, secondaryButton } from "./ui";
import { prepareImage } from "./ProductImages";
import { Spinner } from "../LoadingSpinner";

// Admin -> Inventory -> a product -> Shop: the certificate of analysis for this size. Customers see a "View COA"
// button on the product's photo that opens it.

// COA photos are kept larger than product photos so the small print stays readable.
const COA_IMAGE_EDGE = 2400;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

const describe = (url: string) =>
  /\.blob\.vercel-storage\.com\//.test(url) ? (/\.pdf($|\?)/i.test(url) ? "PDF uploaded" : "Image uploaded") : `Link: ${new URL(url).host}`;

export default function CoaSection({ item, onSaved }: { item: InvItem; onSaved: (item: InvItem) => void }) {
  const { getToken } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<null | "file" | "link" | "remove">(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (what: "file" | "link" | "remove", fn: () => Promise<InvItem>) => {
    setBusy(what);
    setError(null);
    try {
      onSaved(await fn());
      setLink("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const upload = (file: File) =>
    void run("file", async () => {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (isPdf && file.size > MAX_COA_BYTES) throw new Error("That PDF is too large (3 MB at most) - add it as a link instead.");
      const dataUrl = isPdf
        ? (await readAsDataUrl(file)).replace(/^data:[^;]*;/, "data:application/pdf;")
        : await prepareImage(file, COA_IMAGE_EDGE);
      return adminApi.uploadCoa(item.id, dataUrl, getToken);
    });

  return (
    <div className="space-y-2 border-t border-slate-800 pt-3">
      <span className="block text-[11px] font-bold text-white">Certificate of analysis (COA)</span>
      <span className="block text-[11px] text-slate-500">
        For this size{item.variant ? ` (${item.variant})` : ""}. Customers get a "View COA" button on the product photo.
      </span>
      <ErrorNote message={error} />

      {item.coaUrl ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <a
            href={item.coaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold"
          >
            <ExternalLink size={13} /> {describe(item.coaUrl)} - view
          </a>
          <button className={`${secondaryButton} ml-auto`} disabled={busy != null} onClick={() => void run("remove", () => adminApi.removeCoa(item.id, getToken))}>
            {busy === "remove" ? <Spinner size={13} /> : <Trash2 size={13} />} Remove
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">No COA yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) upload(file);
          }}
        />
        <button className={secondaryButton} disabled={busy != null} onClick={() => fileInput.current?.click()}>
          {busy === "file" ? <Spinner size={13} /> : <FileUp size={13} />} {item.coaUrl ? "Replace with a file" : "Upload PDF or image"}
        </button>
      </div>

      <div className="flex gap-2">
        <input
          className={inputClass}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Or paste a link to the lab's COA page"
        />
        <button
          className={secondaryButton}
          disabled={busy != null || !link.trim()}
          onClick={() => void run("link", () => adminApi.setCoaLink(item.id, link.trim(), getToken))}
        >
          {busy === "link" ? <Spinner size={13} /> : <Link2 size={13} />} Save link
        </button>
      </div>
    </div>
  );
}
