import { MAX_IMAGE_BYTES } from "../../shared/shop";
import { businessHeaders } from "./business";
import { signedInFetch } from "./signedInFetch";

// Getting files ready to upload (product photos, COAs, logos, photos and PDFs in messages), and fetching back
// files that can only be opened while signed in.

// A photo or PDF to send with a message, ready to upload.
export interface MessageUpload {
  dataUrl: string;
  name: string;
}

// Shrinks a photo to at most maxEdge px on its longest side and re-encodes it, so uploads stay small
// and the shop loads quickly. WebP keeps transparent backgrounds; browsers that can't write WebP get JPEG.
export async function prepareImage(file: File, maxEdge = 1400): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
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

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

// A file from the app's API that needs the user's sign-in (e.g. /api/shop/messages?file=...), as a Blob.
export async function fetchSignedInFile(url: string, getToken: () => Promise<string | null>): Promise<Blob> {
  const response = await signedInFetch(getToken, (token) =>
    fetch(url, { headers: { Authorization: `Bearer ${token}`, ...businessHeaders() } })
  );
  if (!response) throw new Error("You're signed out - please sign in again.");
  if (!response.ok) throw new Error("That file couldn't be opened.");
  return response.blob();
}
