/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { PeptideDoseConfig, PersistedProtocolBuilderPayload, ProtocolRecord } from "../types";
import { PEPTIDES_DATABASE } from "../data/peptides";
import { toIsoDate } from "../lib/protocolBuilderUtils";
import { createProtocol, deleteProtocol as deleteProtocolRequest, listProtocols, updateProtocol } from "../lib/protocolsApi";

const DEFAULT_PROTOCOL_NAME = "My Protocol";

// Pre-multi-protocol builds kept the single protocol in one of these localStorage keys instead of
// the backend. Read forward from whichever key a returning browser actually has, migrate it into
// the new backend-backed protocol record once, then this logic never runs again for that user.
const PROTOCOL_BUILDER_STORAGE_KEY = "peppal.protocolBuilder.state.v4";
const LEGACY_PROTOCOL_BUILDER_STORAGE_KEYS = ["peppal.protocolBuilder.state.v3", "peppal.protocolBuilder.state.v2"];
const LEGACY_V1_STORAGE_KEY = "peppal.protocolCreator.state.v1";
const ALL_LEGACY_STORAGE_KEYS = [PROTOCOL_BUILDER_STORAGE_KEY, ...LEGACY_PROTOCOL_BUILDER_STORAGE_KEYS, LEGACY_V1_STORAGE_KEY];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ACTIVE_PROTOCOL_ID_KEY = "peppal.activeProtocolId.v1";

// Last-known protocol list per signed-in user, so a returning session can render instantly from
// cache instead of blocking on a DB round-trip. Scoped by clerkUserId so a shared device never
// shows one account's protocols while another account is briefly loading.
const PROTOCOLS_CACHE_KEY_PREFIX = "peppal.protocolsCache.v1.";

const readProtocolsCache = (userId: string): ProtocolRecord[] | null => {
  try {
    const raw = window.localStorage.getItem(PROTOCOLS_CACHE_KEY_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch (error) {
    console.error("Failed to read cached protocols", error);
    return null;
  }
};

const writeProtocolsCache = (userId: string, list: ProtocolRecord[]) => {
  try {
    window.localStorage.setItem(PROTOCOLS_CACHE_KEY_PREFIX + userId, JSON.stringify(list));
  } catch (error) {
    console.error("Failed to cache protocols", error);
  }
};

const DEFAULT_DAYS_BY_FREQUENCY: Record<PeptideDoseConfig["frequency"], string[]> = {
  daily: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
  "2x/daily": ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
  "3x/week": ["MON", "WED", "FRI"],
  "2x/week": ["MON", "THU"],
  weekly: ["MON"]
};

type LegacyV1Payload = {
  selectedPeptideIds?: string[];
  timeframeWeeks?: number;
  bodyWeight?: number;
  bodyWeightTouched?: boolean;
  weightUnit?: "kg" | "lbs";
  protocolMode?: "automated" | "manual";
  manualStartDate?: string;
  manualInjectionDays?: Record<string, string[]>;
  manualPeptideStartDates?: Record<string, string>;
  selectedDoseOptionByPeptide?: Record<string, string>;
  timelineGenerated?: boolean;
  expandedIntel?: Record<string, boolean>;
};

const migrateLegacyV1Payload = (legacy: LegacyV1Payload): PersistedProtocolBuilderPayload => {
  const fallbackStartDate =
    typeof legacy.manualStartDate === "string" && legacy.manualStartDate ? legacy.manualStartDate : toIsoDate(new Date());
  const isManual = legacy.protocolMode === "manual";

  const doseConfigByPeptide: Record<string, PeptideDoseConfig> = {};
  for (const peptideId of legacy.selectedPeptideIds ?? []) {
    const peptide = PEPTIDES_DATABASE.find((p) => p.id === peptideId);
    if (!peptide) continue;

    const optionId = legacy.selectedDoseOptionByPeptide?.[peptideId] ?? peptide.goalDoseOptions?.[0]?.id;
    const option = peptide.goalDoseOptions?.find((o) => o.id === optionId) ?? peptide.goalDoseOptions?.[0];
    const schedule = option?.timelineSchedule ?? peptide.dosingSchedule;
    const manualDays = isManual ? legacy.manualInjectionDays?.[peptideId] : undefined;
    const days = manualDays ?? (schedule.days.length > 0 ? schedule.days : DEFAULT_DAYS_BY_FREQUENCY[schedule.frequency]);
    const startDay = isManual ? legacy.manualPeptideStartDates?.[peptideId] ?? fallbackStartDate : fallbackStartDate;

    doseConfigByPeptide[peptideId] = {
      amount: schedule.amount,
      unit: schedule.unit,
      frequency: schedule.frequency,
      days: [...days],
      startDay
    };
  }

  return {
    selectedPeptideIds: legacy.selectedPeptideIds,
    doseConfigByPeptide,
    builderMode: isManual ? "manual" : "automatic",
    selectedGoalOptionByPeptide: legacy.selectedDoseOptionByPeptide ?? {},
    timeframeWeeks: legacy.timeframeWeeks,
    bodyWeight: legacy.bodyWeight,
    bodyWeightTouched: legacy.bodyWeightTouched,
    weightUnit: legacy.weightUnit,
    protocolStartDate: fallbackStartDate,
    timelineGenerated: legacy.timelineGenerated,
    timelineViewMode: "day",
    selectedDate: toIsoDate(new Date()),
    completedDoses: {},
    expandedIntel: legacy.expandedIntel ?? {}
  };
};

// Looks for a single-protocol payload left over from before multi-protocol support. Returns null
// if this browser has never used the Protocol Builder (or has already been migrated and cleared).
const loadLegacyPayload = (): PersistedProtocolBuilderPayload | null => {
  const currentRaw = window.localStorage.getItem(PROTOCOL_BUILDER_STORAGE_KEY);
  if (currentRaw) {
    try {
      return JSON.parse(currentRaw) as PersistedProtocolBuilderPayload;
    } catch (error) {
      console.error("Failed to parse legacy protocol builder state", error);
      return null;
    }
  }

  for (const legacyKey of LEGACY_PROTOCOL_BUILDER_STORAGE_KEYS) {
    const legacyRaw = window.localStorage.getItem(legacyKey);
    if (!legacyRaw) continue;

    try {
      const legacy = JSON.parse(legacyRaw) as PersistedProtocolBuilderPayload;
      const fallbackStartDate =
        typeof legacy.protocolStartDate === "string" && legacy.protocolStartDate ? legacy.protocolStartDate : toIsoDate(new Date());

      const sanitizedDoseConfig: Record<string, PeptideDoseConfig> = {};
      if (legacy.doseConfigByPeptide && typeof legacy.doseConfigByPeptide === "object") {
        for (const [peptideId, config] of Object.entries(legacy.doseConfigByPeptide)) {
          sanitizedDoseConfig[peptideId] = {
            ...config,
            startDay: ISO_DATE_PATTERN.test(config?.startDay ?? "") ? config.startDay : fallbackStartDate
          };
        }
      }

      return {
        ...legacy,
        doseConfigByPeptide: sanitizedDoseConfig,
        builderMode: legacy.builderMode ?? "manual",
        protocolDataSource: legacy.protocolDataSource ?? "pep-pedia",
        selectedGoalOptionByPeptide: legacy.selectedGoalOptionByPeptide ?? {},
        timelineViewMode: legacy.timelineViewMode ?? "day",
        selectedDate: legacy.selectedDate ?? toIsoDate(new Date()),
        completedDoses: legacy.completedDoses ?? {}
      };
    } catch (error) {
      console.error(`Failed to parse legacy protocol builder state (${legacyKey})`, error);
    }
  }

  const legacyV1Raw = window.localStorage.getItem(LEGACY_V1_STORAGE_KEY);
  if (legacyV1Raw) {
    try {
      const legacy = JSON.parse(legacyV1Raw) as LegacyV1Payload;
      return migrateLegacyV1Payload(legacy);
    } catch (error) {
      console.error(`Failed to parse legacy protocol builder state (${LEGACY_V1_STORAGE_KEY})`, error);
    }
  }

  return null;
};

const clearLegacyStorageKeys = () => {
  for (const key of ALL_LEGACY_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.error(`Failed to clear legacy protocol builder key (${key})`, error);
    }
  }
};

export function useProtocols() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const [protocols, setProtocols] = useState<ProtocolRecord[]>([]);
  const [activeProtocolId, setActiveProtocolId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const bootstrappedRef = useRef(false);

  const getClientToken = useCallback(async () => getToken(), [getToken]);

  const setProtocolsAndCache = useCallback(
    (updater: ProtocolRecord[] | ((prev: ProtocolRecord[]) => ProtocolRecord[])) => {
      setProtocols((prev) => {
        const next = typeof updater === "function" ? (updater as (p: ProtocolRecord[]) => ProtocolRecord[])(prev) : updater;
        if (userId) writeProtocolsCache(userId, next);
        return next;
      });
    },
    [userId]
  );

  const bootstrap = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      let list = await listProtocols(getClientToken);

      if (list.length === 0) {
        const legacyPayload = loadLegacyPayload();
        const created = await createProtocol(
          legacyPayload
            ? { name: DEFAULT_PROTOCOL_NAME, data: legacyPayload }
            : { name: DEFAULT_PROTOCOL_NAME },
          getClientToken
        );
        if (legacyPayload) {
          clearLegacyStorageKeys();
        }
        list = [created];
      }

      setProtocolsAndCache(list);

      // If the cached render above already picked an active protocol that's still present in
      // the fresh list, keep it — don't yank the user to a different protocol mid-view just
      // because the background refresh resolved.
      setActiveProtocolId((prevId) => {
        if (prevId && list.some((p) => p.id === prevId)) return prevId;
        const storedActiveId = window.localStorage.getItem(ACTIVE_PROTOCOL_ID_KEY);
        return list.some((p) => p.id === storedActiveId) ? storedActiveId! : list[0].id;
      });
    } catch (error) {
      console.error("Failed to load protocols", error);
      setLoadError(error instanceof Error ? error.message : "Failed to load protocols");
    } finally {
      setIsLoading(false);
    }
  }, [getClientToken, setProtocolsAndCache]);

  // useLayoutEffect (not useEffect) so a cache hit is applied before the browser paints the
  // "Loading your protocols..." fallback — on a returning visit the user never sees it flash.
  useLayoutEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      setIsLoading(false);
      return;
    }
    // bootstrappedRef (not a cleanup-based `cancelled` flag) is what makes this idempotent under
    // StrictMode's dev-only double-invoke: it guarantees the body below runs at most once per
    // hook instance, so there's no stale-closure result to guard against once it resolves.
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const cached = readProtocolsCache(userId);
    if (cached) {
      setProtocols(cached);
      const storedActiveId = window.localStorage.getItem(ACTIVE_PROTOCOL_ID_KEY);
      setActiveProtocolId(cached.some((p) => p.id === storedActiveId) ? storedActiveId! : cached[0].id);
      setIsLoading(false);
    }

    void bootstrap();
  }, [bootstrap, isLoaded, isSignedIn, userId]);

  const retry = useCallback(() => {
    void bootstrap();
  }, [bootstrap]);

  const switchProtocol = useCallback((id: string) => {
    setActiveProtocolId(id);
    try {
      window.localStorage.setItem(ACTIVE_PROTOCOL_ID_KEY, id);
    } catch (error) {
      console.error("Failed to persist active protocol id", error);
    }
  }, []);

  const createNewProtocol = useCallback(
    async (name: string) => {
      const created = await createProtocol({ name }, getClientToken);
      setProtocolsAndCache((prev) => [...prev, created]);
      switchProtocol(created.id);
      return created;
    },
    [getClientToken, setProtocolsAndCache, switchProtocol]
  );

  const renameProtocol = useCallback(
    async (id: string, name: string) => {
      const updated = await updateProtocol(id, { name }, getClientToken);
      setProtocolsAndCache((prev) => prev.map((p) => (p.id === id ? updated : p)));
    },
    [getClientToken, setProtocolsAndCache]
  );

  const deleteProtocol = useCallback(
    async (id: string) => {
      await deleteProtocolRequest(id, getClientToken);

      const remaining = protocols.filter((p) => p.id !== id);

      if (remaining.length === 0) {
        const created = await createProtocol({ name: DEFAULT_PROTOCOL_NAME }, getClientToken);
        setProtocolsAndCache([created]);
        switchProtocol(created.id);
        return;
      }

      setProtocolsAndCache(remaining);
      if (activeProtocolId === id) {
        switchProtocol(remaining[0].id);
      }
    },
    [activeProtocolId, getClientToken, protocols, setProtocolsAndCache, switchProtocol]
  );

  const saveProtocolData = useCallback((id: string, data: PersistedProtocolBuilderPayload) => {
    void updateProtocol(id, { data }, getClientToken)
      .then((updated) => {
        setProtocolsAndCache((prev) => prev.map((p) => (p.id === id ? updated : p)));
      })
      .catch((error) => {
        console.error("Failed to persist protocol data to Neon", error);
      });
  }, [getClientToken, setProtocolsAndCache]);

  const activeProtocol = protocols.find((p) => p.id === activeProtocolId) ?? null;

  return {
    protocols,
    activeProtocolId,
    activeProtocol,
    isLoading,
    loadError,
    retry,
    switchProtocol,
    createProtocol: createNewProtocol,
    renameProtocol,
    deleteProtocol,
    saveProtocolData
  };
}

export type ProtocolsRegistry = ReturnType<typeof useProtocols>;
