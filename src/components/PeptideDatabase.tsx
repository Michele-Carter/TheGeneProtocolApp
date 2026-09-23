/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import PeptideDbBrowse from "./peptideDb/PeptideDbBrowse";
import PeptideDbDetail from "./peptideDb/PeptideDbDetail";

type PeptideDbSubView = "browse" | "detail";

export default function PeptideDatabase() {
  const [subView, setSubView] = useState<PeptideDbSubView>("browse");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    // Browse <-> detail (and detail -> detail via related-peptide links) are state
    // swaps within the same tab, not real navigation, so they inherit whatever scroll
    // position the previous view was left at instead of landing at the top.
    document.querySelector(".app-main-scroller")?.scrollTo({ top: 0 });
  }, [subView, selectedSlug]);

  const openDetail = (slug: string) => {
    setSelectedSlug(slug);
    setSubView("detail");
  };

  const backToBrowse = () => {
    setSubView("browse");
    setSelectedSlug(null);
  };

  if (subView === "detail" && selectedSlug) {
    return <PeptideDbDetail slug={selectedSlug} onBack={backToBrowse} onNavigateToSlug={openDetail} />;
  }

  return <PeptideDbBrowse onSelect={openDetail} />;
}
