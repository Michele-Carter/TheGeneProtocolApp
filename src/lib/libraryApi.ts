import type { LibraryRecord } from "../../shared/library";
import type { PeptideLibrary } from "../types";

// Loads the peptide library of the business the user is using the app as (api/library.ts).

type GetToken = () => Promise<string | null>;

export async function fetchLibraryRecords(getToken: GetToken): Promise<LibraryRecord[]> {
  const token = await getToken();
  if (!token) throw new Error("You're signed out - please sign in again.");
  // The browser revalidates its cached copy, so an unchanged library isn't downloaded again.
  const response = await fetch("/api/library", { headers: { Authorization: `Bearer ${token}` }, cache: "no-cache" });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.error ?? `Request failed (${response.status})`);
  return body as LibraryRecord[];
}

// Records arrive in display order.
export function toLibrary(records: LibraryRecord[]): PeptideLibrary {
  const library: PeptideLibrary = { entries: [], peptides: [], interactions: [], peptideDbMeta: {}, peptideDosagesMeta: {} };
  for (const record of records) {
    const data = record.data as any;
    if (record.kind === "entry") library.entries.push(data);
    else if (record.kind === "peptide") library.peptides.push(data);
    else if (record.kind === "interaction") library.interactions.push(data);
    else if (record.kind === "peptidedb-meta") library.peptideDbMeta[record.key] = data;
    else if (record.kind === "peptidedosages-meta") library.peptideDosagesMeta[record.key] = data;
  }
  return library;
}
