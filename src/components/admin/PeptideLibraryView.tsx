import React, { useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { ArrowLeft, Pencil, Plus, Save, Search, Trash2 } from "lucide-react";
import type { LibraryKind } from "../../../shared/library";
import { LibraryGate, usePeptideLibrary, usePeptideLibraryState } from "../../hooks/usePeptideLibrary";
import { adminApi } from "../../lib/adminApi";
import type { PeptideDbEntry, PeptideInteraction, PeptideProtocolInfo } from "../../types";
import { ErrorNote, dangerButton, inputClass, primaryButton, secondaryButton } from "./ui";
import { RecordFormSections, blankFor, cleanRecord, type FormSection } from "./RecordForm";
import { entrySections, interactionSections, peptideDbMetaFields, peptideDosagesMetaFields, peptideSections } from "./librarySpecs";
import { Spinner } from "../LoadingSpinner";

// The business's own peptide library: Peptide Database pages, the peptides the Protocol Builder offers, and
// how those peptides interact. Changes show in the app straight away, for this business only.

type Tab = "pages" | "peptides" | "interactions";

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: "pages", label: "Peptide Database", blurb: "The pages in the Peptide Database tab." },
  { id: "peptides", label: "Protocol Builder", blurb: "The peptides people can add to a protocol, with their dosing." },
  { id: "interactions", label: "Interactions", blurb: "Notes shown when two Protocol Builder peptides are in the same stack." },
];

type Editing =
  | { tab: "pages"; record: PeptideDbEntry | null }
  | { tab: "peptides"; record: PeptideProtocolInfo | null }
  | { tab: "interactions"; record: PeptideInteraction | null };

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const blankRecord = (sections: FormSection[]) => Object.assign({}, ...sections.map((s) => blankFor(s.fields)));

export default function PeptideLibraryView() {
  return (
    <LibraryGate>
      <LibraryEditor />
    </LibraryGate>
  );
}

function LibraryEditor() {
  const library = usePeptideLibrary();
  const [tab, setTab] = useState<Tab>("pages");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);

  const peptideName = useMemo(() => new Map(library.peptides.map((p) => [p.id, p.name])), [library]);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const match = (text: string) => !query || text.toLowerCase().includes(query);
    if (tab === "pages") {
      return [...library.entries]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((e) => match(`${e.name} ${e.slug} ${e.subtitle}`))
        .map((e) => ({ key: e.slug, title: e.name, detail: e.subtitle, open: () => setEditing({ tab, record: e }) }));
    }
    if (tab === "peptides") {
      return [...library.peptides]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((p) => match(`${p.name} ${p.id} ${p.category}`))
        .map((p) => ({ key: p.id, title: p.name, detail: p.category, open: () => setEditing({ tab, record: p }) }));
    }
    return library.interactions
      .map((i) => ({ i, title: `${peptideName.get(i.peptideA) ?? i.peptideA} + ${peptideName.get(i.peptideB) ?? i.peptideB}` }))
      .filter(({ i, title }) => match(`${title} ${i.type}`))
      .map(({ i, title }) => ({ key: `${i.peptideA}|${i.peptideB}`, title, detail: i.type, open: () => setEditing({ tab, record: i }) }));
  }, [library, tab, search, peptideName]);

  if (editing) return <RecordEditor editing={editing} onDone={() => setEditing(null)} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setSearch("");
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
              tab === t.id ? "border-gold-500/60 text-gold-400 bg-gold-500/10" : "border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-400">{TABS.find((t) => t.id === tab)!.blurb}</p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className={`${inputClass} pl-8`} placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className={primaryButton} onClick={() => setEditing({ tab, record: null } as Editing)}>
          <Plus size={13} /> Add {tab === "pages" ? "page" : tab === "peptides" ? "peptide" : "interaction"}
        </button>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl divide-y divide-slate-800/70">
        {rows.map((row) => (
          <button
            key={row.key}
            onClick={row.open}
            className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-900/60 transition cursor-pointer"
          >
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">{row.title}</div>
              {row.detail && <div className="text-xs text-slate-400 mt-0.5 truncate">{row.detail}</div>}
            </div>
            <Pencil size={13} className="text-slate-500 flex-shrink-0 mt-1" />
          </button>
        ))}
        {rows.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">{search ? `Nothing matches "${search}".` : "Nothing here yet."}</div>}
      </div>
    </div>
  );
}

function RecordEditor({ editing, onDone }: { editing: Editing; onDone: () => void }) {
  const { getToken } = useAuth();
  const library = usePeptideLibrary();
  const { reload } = usePeptideLibraryState();
  const isNew = editing.record == null;

  const peptideOptions = useMemo(
    () => [...library.peptides].sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.id, label: p.name })),
    [library]
  );
  const sections = useMemo(
    () =>
      editing.tab === "pages" ? entrySections(peptideOptions) : editing.tab === "peptides" ? peptideSections : interactionSections(peptideOptions),
    [editing.tab, peptideOptions]
  );
  const kind: LibraryKind = editing.tab === "pages" ? "entry" : editing.tab === "peptides" ? "peptide" : "interaction";
  const idKey = editing.tab === "pages" ? "slug" : editing.tab === "peptides" ? "id" : null;
  const originalKey =
    editing.tab === "pages"
      ? editing.record?.slug
      : editing.tab === "peptides"
        ? editing.record?.id
        : editing.record && `${editing.record.peptideA}|${editing.record.peptideB}`;

  const [form, setForm] = useState<Record<string, any>>(() => structuredClone(editing.record ?? blankRecord(sections)));
  // A Protocol Builder peptide's dosing notes for My Stack, saved alongside it.
  const peptideId = editing.tab === "peptides" ? editing.record?.id : undefined;
  const [notes, setNotes] = useState<Record<string, any>>(() => ({
    db: peptideId ? structuredClone(library.peptideDbMeta[peptideId]) : undefined,
    dosages: peptideId ? structuredClone(library.peptideDosagesMeta[peptideId]) : undefined,
  }));
  const [initial] = useState(() => JSON.stringify({ form, notes }));
  const [busy, setBusy] = useState<null | "save" | "delete">(null);
  const [error, setError] = useState<string | null>(null);

  // A new record's id follows its name until the id is typed in.
  const changeForm = (next: Record<string, any>) => {
    if (isNew && idKey && form[idKey] === slugify(form.name ?? "") && next[idKey] === form[idKey]) {
      next = { ...next, [idKey]: slugify(next.name ?? "") };
    }
    setForm(next);
  };

  const title =
    editing.tab === "interactions"
      ? isNew
        ? "New interaction"
        : `${peptideOptions.find((p) => p.value === form.peptideA)?.label ?? form.peptideA} + ${peptideOptions.find((p) => p.value === form.peptideB)?.label ?? form.peptideB}`
      : form.name || (editing.tab === "pages" ? "New page" : "New peptide");

  const back = () => {
    if (JSON.stringify({ form, notes }) !== initial && !window.confirm("Leave without saving your changes?")) return;
    onDone();
  };

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      const data = cleanRecord(form);
      if (editing.tab === "pages" && !data.linkedPeptideId) delete data.linkedPeptideId;
      const saved = await adminApi.saveLibraryRecord(kind, isNew ? null : originalKey!, data, getToken);
      if (editing.tab === "peptides") {
        for (const [noteKind, value, had] of [
          ["peptidedb-meta", notes.db, peptideId && library.peptideDbMeta[peptideId]],
          ["peptidedosages-meta", notes.dosages, peptideId && library.peptideDosagesMeta[peptideId]],
        ] as const) {
          if (value) await adminApi.saveLibraryRecord(noteKind, saved.key, cleanRecord(value), getToken);
          else if (had) await adminApi.deleteLibraryRecord(noteKind, saved.key, getToken);
        }
      }
      await reload();
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const remove = async () => {
    const warning =
      editing.tab === "peptides"
        ? `Delete ${title}? Anyone with it in a saved protocol will have it taken out of their stack.`
        : `Delete ${title}?`;
    if (!originalKey || !window.confirm(warning)) return;
    setBusy("delete");
    setError(null);
    try {
      await adminApi.deleteLibraryRecord(kind, originalKey, getToken);
      await reload();
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <button onClick={back} className="inline-flex items-center gap-1.5 text-xs font-bold text-gold-400 hover:text-gold-300 cursor-pointer">
        <ArrowLeft size={13} /> Peptide library
      </button>
      <h3 className="text-base font-black text-white">{title}</h3>

      <RecordFormSections sections={sections} value={form} onChange={changeForm} isNew={isNew} />
      {editing.tab === "peptides" && (
        <RecordFormSections
          sections={[
            {
              title: "My Stack notes",
              fields: [
                { key: "db", label: "Peptide DB notes", type: "group", optional: true, fields: peptideDbMetaFields },
                { key: "dosages", label: "Peptide Dosages notes", type: "group", optional: true, fields: peptideDosagesMetaFields },
              ],
            },
          ]}
          value={notes}
          onChange={setNotes}
          isNew={isNew}
        />
      )}

      <ErrorNote message={error} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button className={primaryButton} onClick={save} disabled={busy != null}>
            {busy === "save" ? <Spinner size={13} /> : <Save size={13} />} Save
          </button>
          <button className={secondaryButton} onClick={back} disabled={busy != null}>
            Cancel
          </button>
        </div>
        {!isNew && (
          <button className={dangerButton} onClick={remove} disabled={busy != null}>
            {busy === "delete" ? <Spinner size={13} /> : <Trash2 size={13} />} Delete
          </button>
        )}
      </div>
    </div>
  );
}
