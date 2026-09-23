/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from "react";
import { useProtocolBuilderState } from "../hooks/useProtocolBuilderState";
import { useProtocols, ProtocolsRegistry } from "../hooks/useProtocols";
import { ProtocolRecord } from "../types";
import ProtocolHub from "./ProtocolHub";
import ProtocolCreate from "./ProtocolCreate";
import CurrentProtocolView from "./CurrentProtocolView";
import MyStackView from "./MyStackView";

export type ProtocolSubView = "hub" | "create" | "current" | "stack";

export default function ProtocolBuilder() {
  const registry = useProtocols();
  const [subView, setSubView] = useState<ProtocolSubView>("hub");

  if (registry.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
        Loading your protocols...
      </div>
    );
  }

  if (!registry.activeProtocol) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-slate-300 text-sm">
          {registry.loadError ? "Couldn't load your protocols." : "No protocol found."}
        </p>
        {registry.loadError && <p className="text-slate-500 text-xs max-w-sm">{registry.loadError}</p>}
        <button
          onClick={registry.retry}
          className="mt-1 px-4 py-2 rounded-lg text-xs font-bold bg-transparent text-gold-400 border border-gold-500/60 hover:bg-slate-900/40 transition"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <ProtocolBuilderActive
      key={registry.activeProtocol.id}
      protocol={registry.activeProtocol}
      registry={registry}
      subView={subView}
      setSubView={setSubView}
    />
  );
}

function ProtocolBuilderActive({
  protocol,
  registry,
  subView,
  setSubView
}: {
  protocol: ProtocolRecord;
  registry: ProtocolsRegistry;
  subView: ProtocolSubView;
  setSubView: (view: ProtocolSubView) => void;
}) {
  const onPersist = useCallback(
    (data: Parameters<ProtocolsRegistry["saveProtocolData"]>[1]) => registry.saveProtocolData(protocol.id, data),
    [registry, protocol.id]
  );
  const state = useProtocolBuilderState(protocol, onPersist);

  useEffect(() => {
    // hub/create/current/stack are state swaps within the same tab, not real
    // navigation, so they inherit whatever scroll position the previous sub-view was
    // left at instead of landing at the top.
    document.querySelector(".app-main-scroller")?.scrollTo({ top: 0 });
  }, [subView]);

  const onBack = () => setSubView("hub");

  switch (subView) {
    case "create":
      return <ProtocolCreate state={state} onNavigate={setSubView} onBack={onBack} />;
    case "current":
      return <CurrentProtocolView state={state} onNavigate={setSubView} onBack={onBack} />;
    case "stack":
      return <MyStackView state={state} onNavigate={setSubView} onBack={onBack} />;
    case "hub":
    default:
      return <ProtocolHub state={state} onNavigate={setSubView} registry={registry} />;
  }
}
