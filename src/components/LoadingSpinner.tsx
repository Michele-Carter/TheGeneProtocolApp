/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Loader2 } from "lucide-react";

export default function LoadingSpinner({ label = "Loading...", className = "py-10" }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-slate-500 ${className}`}>
      <Loader2 size={22} className="animate-spin text-gold-400" />
      <span className="text-xs">{label}</span>
    </div>
  );
}

// Icon-only spinner for inline use (buttons mid-save, etc.) — drop in place of the button's usual icon.
export function Spinner({ size = 13, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}
