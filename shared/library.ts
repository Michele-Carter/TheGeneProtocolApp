// Each business's own peptide library (Peptide Database pages, Protocol Builder peptides, interactions and
// dosing notes) and supplier price list. New businesses start with a copy of The Gene Protocol's library and
// an empty price list.

// What a peptide_library row holds (api/_lib/schema.ts). Data shapes are in src/types.ts.
export const LIBRARY_KINDS = [
  "entry", // Peptide Database page (PeptideDbEntry), key = slug
  "peptide", // Protocol Builder peptide (PeptideProtocolInfo), key = id
  "interaction", // two Protocol Builder peptides together (PeptideInteraction), key = "<peptideA>|<peptideB>"
  "peptidedb-meta", // Peptide DB dosing notes (PeptideDbMeta), key = peptide id
  "peptidedosages-meta", // Peptide Dosages dosing notes (PeptideDosagesMeta), key = peptide id
] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export interface LibraryRecord<T = unknown> {
  kind: LibraryKind;
  key: string;
  data: T;
}

// The key a record is saved under, taken from its own data.
export function libraryKey(kind: LibraryKind, data: any): string {
  if (kind === "entry") return String(data?.slug ?? "").trim();
  if (kind === "peptide") return String(data?.id ?? "").trim();
  if (kind === "interaction") return `${String(data?.peptideA ?? "").trim()}|${String(data?.peptideB ?? "").trim()}`;
  return "";
}

// A product on the supplier's price list, e.g. Retatrutide in 10mg and 20mg.
export interface SupplierOption {
  code?: string; // the supplier's product code - picking it on a supplier order stocks inventory item "cat:<code>"
  vialSize: string;
  priceUsd: number; // what the supplier charges (in the order's currency, despite the name)
  inStock?: boolean;
}

export interface SupplierProduct {
  id: string;
  name: string;
  note: string;
  options: SupplierOption[];
}
