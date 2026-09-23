/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { toBlob, toCanvas } from "html-to-image";
import jsPDF from "jspdf";

// Matches the app's dark background so any transparent edges in the captured DOM don't fall back
// to a white canvas fill. Note: html2canvas was tried first here but its manual CSS color parser
// can't handle oklch() - the format Tailwind v4 compiles all its palette colors to - and hung
// indefinitely trying to read computed styles across the whole tree. html-to-image instead lets
// the browser itself paint the DOM (via an SVG foreignObject), so modern color functions just work.
const CAPTURE_BACKGROUND = "#020617";

// A Blob + object URL, not a raw data: URI - very long data URIs are unreliable with `<a download>`
// in some browsers, which can silently fall back to navigating the tab to the URL instead of
// saving it (exactly what jsPDF's own battle-tested .save() already does internally for the PDF
// path below - this brings the JPEG path in line with it).
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Deferred, not immediate - revoking synchronously can race the browser actually starting the
  // download from this URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadElementAsJpeg(element: HTMLElement, filename: string): Promise<void> {
  const blob = await toBlob(element, { backgroundColor: CAPTURE_BACKGROUND, pixelRatio: 2, quality: 0.95, type: "image/jpeg" });
  if (!blob) throw new Error("Failed to render calendar to an image");
  triggerBlobDownload(blob, `${filename}.jpg`);
}

export async function downloadElementAsPdf(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await toCanvas(element, { backgroundColor: CAPTURE_BACKGROUND, pixelRatio: 2 });
  // One PDF page sized exactly to the captured image - no paper-size scaling to worry about.
  const pdf = new jsPDF({
    orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
    unit: "px",
    format: [canvas.width, canvas.height]
  });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, canvas.width, canvas.height);
  pdf.save(`${filename}.pdf`);
}
