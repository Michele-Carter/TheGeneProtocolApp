import React, { useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_PRODUCT } from "../../../shared/shop";
import { adminApi, type ImageTarget } from "../../lib/adminApi";
import { ErrorNote, secondaryButton } from "./ui";
import { Spinner } from "../LoadingSpinner";

const MAX_EDGE = 1400;

// Shrinks a photo to at most MAX_EDGE px on its longest side and re-encodes it, so uploads stay small
// and the shop loads quickly. WebP keeps transparent backgrounds; browsers that can't write WebP get JPEG.
async function prepareImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't read that image.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let dataUrl = canvas.toDataURL("image/webp", 0.86);
  if (!dataUrl.startsWith("data:image/webp")) {
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  }
  // Base64 is about 4/3 the size of the file.
  if ((dataUrl.length * 3) / 4 > MAX_IMAGE_BYTES) throw new Error(`${file.name} is too large even after resizing.`);
  return dataUrl;
}

export default function ProductImages({
  target,
  id,
  images,
  onChange,
}: {
  target: ImageTarget;
  id: string;
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "upload" | string>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const room = MAX_IMAGES_PER_PRODUCT - images.length;

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setBusy("upload");
    let latest = images;
    try {
      const toSend = files.slice(0, room);
      for (const [index, file] of toSend.entries()) {
        setProgress(toSend.length > 1 ? `${index + 1} of ${toSend.length}` : "");
        const dataUrl = await prepareImage(file);
        latest = (await adminApi.addImage(target, id, dataUrl, getToken)).images;
        onChange(latest);
      }
      if (files.length > room) setError(`Only ${room} more image${room === 1 ? "" : "s"} fit (up to ${MAX_IMAGES_PER_PRODUCT}).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const run = async (key: string, fn: () => Promise<{ images: string[] }>) => {
    setError(null);
    setBusy(key);
    try {
      onChange((await fn()).images);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const makeMain = (url: string) =>
    run(`main:${url}`, () => adminApi.reorderImages(target, id, [url, ...images.filter((u) => u !== url)], getToken));

  const remove = (url: string) => {
    if (!window.confirm("Remove this image?")) return;
    void run(`remove:${url}`, () => adminApi.removeImage(target, id, url, getToken));
  };

  return (
    <div className="space-y-3">
      {images.length === 0 ? (
        <p className="text-xs text-slate-500">No images yet. The first one you add is shown on the shop card.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {images.map((url, index) => (
            <div
              key={url}
              className={`relative group aspect-square rounded-xl overflow-hidden bg-white border ${
                index === 0 ? "border-gold-500/70" : "border-slate-800"
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-contain" loading="lazy" />
              {index === 0 && (
                <span className="absolute top-1 left-1 text-[9px] font-black uppercase tracking-wide bg-gold-500 text-slate-950 rounded px-1.5 py-0.5">
                  Main
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 p-1 bg-slate-950/70 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => void makeMain(url)}
                    disabled={busy != null}
                    className="p-1 rounded text-slate-300 hover:text-gold-400 cursor-pointer disabled:opacity-40"
                    aria-label="Make main image"
                    title="Make main image"
                  >
                    {busy === `main:${url}` ? <Spinner size={12} /> : <Star size={12} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(url)}
                  disabled={busy != null}
                  className="p-1 rounded text-slate-300 hover:text-red-400 cursor-pointer disabled:opacity-40"
                  aria-label="Remove image"
                  title="Remove image"
                >
                  {busy === `remove:${url}` ? <Spinner size={12} /> : <Trash2 size={12} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => void upload(Array.from(e.target.files ?? []))}
      />
      <button
        type="button"
        className={secondaryButton}
        onClick={() => inputRef.current?.click()}
        disabled={busy != null || room <= 0}
      >
        {busy === "upload" ? <Spinner size={13} /> : <ImagePlus size={13} />}
        {busy === "upload" ? `Uploading${progress ? ` ${progress}` : ""}…` : room <= 0 ? "Image limit reached" : "Add images"}
      </button>
      <ErrorNote message={error} />
    </div>
  );
}
