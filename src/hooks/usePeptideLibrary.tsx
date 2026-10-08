import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle } from "lucide-react";
import LoadingSpinner from "../components/LoadingSpinner";
import { fetchLibraryRecords, toLibrary } from "../lib/libraryApi";
import type { PeptideLibrary } from "../types";

// The peptide library (Peptide Database, Protocol Builder peptides, interactions, dosing notes) belongs to
// each business, so it's loaded from the server once the user is signed in rather than built into the app.

interface LibraryState {
  library: PeptideLibrary | null;
  error: string | null;
  reload: () => Promise<void>;
}

const LibraryContext = createContext<LibraryState | null>(null);

export function PeptideLibraryProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const [library, setLibrary] = useState<PeptideLibrary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLibrary(toLibrary(await fetchLibraryRecords(getToken)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <LibraryContext.Provider value={{ library, error, reload }}>{children}</LibraryContext.Provider>;
}

function useLibraryState(): LibraryState {
  const state = useContext(LibraryContext);
  if (!state) throw new Error("usePeptideLibrary must be used inside PeptideLibraryProvider");
  return state;
}

// The library, or null while it's loading. reload() fetches it again after an edit.
export function usePeptideLibraryState() {
  return useLibraryState();
}

// For components inside <LibraryGate>, which only renders them once the library has loaded.
export function usePeptideLibrary(): PeptideLibrary {
  const { library } = useLibraryState();
  if (!library) throw new Error("usePeptideLibrary used outside <LibraryGate>");
  return library;
}

// Shows a spinner until the library has loaded (or the error, with a retry).
export function LibraryGate({ children }: { children: React.ReactNode }) {
  const { library, error, reload } = useLibraryState();
  if (library) return <>{children}</>;
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertTriangle size={22} className="text-red-400" />
        <p className="text-sm text-slate-400">Couldn't load the peptide library: {error}</p>
        <button
          onClick={() => void reload()}
          className="px-4 py-2 rounded-lg text-xs font-bold border border-gold-500/60 text-gold-400 hover:bg-gold-500/10 cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }
  return <LoadingSpinner label="Loading peptide library..." />;
}
