import { useState, useEffect } from "react";
import type { BankCategory, BankQuery, SavedQuery, ThreadSummary } from "../types";
import { bankApi } from "../lib/api";

interface Props {
  threads: ThreadSummary[];
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  savedQueries: SavedQuery[];
  onRecall: (saved: SavedQuery) => void;
  onUnsave: (id: string) => void;
  onLoadBankQuery: (q: BankQuery) => void;
}

const DIALECT_LABEL: Record<string, string> = {
  postgresql: "PG",
  tsql:       "T-SQL",
  mysql:      "MySQL",
  sqlite:     "SQLite",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function Sidebar({
  threads,
  activeThreadId,
  onSelect,
  onNew,
  savedQueries,
  onRecall,
  onUnsave,
  onLoadBankQuery,
}: Props) {
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [bankOpen, setBankOpen]       = useState(false);
  const [bankCats, setBankCats]       = useState<BankCategory[]>([]);
  const [openCat, setOpenCat]         = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (bankOpen && bankCats.length === 0) {
      bankApi.getBank().then((b) => setBankCats(b.categories)).catch(() => {});
    }
  }, [bankOpen, bankCats.length]);

  return (
    <aside className="flex flex-col h-full bg-gray-950 border-r border-gray-800 w-64 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-400">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1zm3 8V5.5a3 3 0 1 0-6 0V9h6z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-semibold text-gray-200">Query Pro</span>
        </div>
        <button
          onClick={onNew}
          title="New thread"
          aria-label="New thread"
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 space-y-1">
        {/* ── Saved Library ───────────────────────────────────────── */}
        <div>
          <button
            onClick={() => setLibraryOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-brand-500">
                <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.575a.75.75 0 0 1-1.12.814L8 11.944l-3.136 1.05a.75.75 0 0 1-1.12-.814l.853-3.576L1.806 7.215a.75.75 0 0 1 .428-1.317l3.664-.293L7.308 2.21A.75.75 0 0 1 8 1.75z" clipRule="evenodd" />
              </svg>
              Saved ({savedQueries.length})
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className={`w-3 h-3 transition-transform ${libraryOpen ? "" : "-rotate-90"}`}
            >
              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {libraryOpen && (
            <ul className="space-y-0.5 px-2">
              {savedQueries.length === 0 ? (
                <li className="text-xs text-gray-600 px-3 py-2">
                  No saved queries yet — hit ★ Save on any SQL result.
                </li>
              ) : (
                savedQueries.map((q) => (
                  <li key={q.id} className="group relative">
                    {confirmDelete === q.id ? (
                      <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/30">
                        <span className="text-xs text-red-300 flex-1">Remove?</span>
                        <button
                          onClick={() => { onUnsave(q.id); setConfirmDelete(null); }}
                          className="text-[11px] text-red-400 hover:text-red-200 font-medium px-1"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-[11px] text-gray-500 hover:text-gray-300 px-1"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onRecall(q)}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-900 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-medium text-brand-300">{q.label}</span>
                          <span className="text-[10px] text-gray-600 shrink-0">
                            {DIALECT_LABEL[q.dialect] ?? q.dialect}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[11px] text-gray-600 truncate">{timeAgo(q.created_at)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(q.id); }}
                            className="opacity-0 group-hover:opacity-100 text-[11px] text-gray-600 hover:text-red-400 px-1 transition-all"
                            title="Remove from library"
                          >
                            ×
                          </button>
                        </div>
                      </button>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {/* ── Query bank (templates) ──────────────────────────────── */}
        <div>
          <button
            onClick={() => setBankOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-cyan-500">
                <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-9zm1.5 0v9h7v-9h-7z" />
              </svg>
              Templates
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
              className={`w-3 h-3 transition-transform ${bankOpen ? "" : "-rotate-90"}`}>
              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {bankOpen && (
            <div className="px-2 space-y-0.5">
              {bankCats.length === 0 ? (
                <p className="text-xs text-gray-600 px-3 py-2">Loading…</p>
              ) : (
                bankCats.map((cat) => (
                  <div key={cat.id}>
                    <button
                      onClick={() => setOpenCat((v) => v === cat.id ? null : cat.id)}
                      className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-900 transition-colors"
                    >
                      <span>{cat.icon} {cat.name}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                        className={`w-3 h-3 shrink-0 transition-transform ${openCat === cat.id ? "" : "-rotate-90"}`}>
                        <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {openCat === cat.id && (
                      <ul className="pl-3 space-y-0.5 pb-1">
                        {cat.queries.map((q) => (
                          <li key={q.id}>
                            <button
                              onClick={() => onLoadBankQuery(q)}
                              className="w-full text-left px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-cyan-300 hover:bg-cyan-900/10 transition-colors"
                              title={q.use_case}
                            >
                              <span className="font-medium">{q.name}</span>
                              <span className="block text-gray-600 truncate mt-0.5">{q.description}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Thread history ───────────────────────────────────────── */}
        <div>
          <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            History
          </p>
          {threads.length === 0 ? (
            <p className="text-xs text-gray-600 text-center px-4 py-4">
              No threads yet. Ask your first question!
            </p>
          ) : (
            <ul className="space-y-0.5 px-2">
              {threads.map((t) => (
                <li key={t.thread_id}>
                  <button
                    onClick={() => onSelect(t.thread_id)}
                    className={`
                      w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm
                      ${
                        activeThreadId === t.thread_id
                          ? "bg-gray-800 text-white"
                          : "text-gray-400 hover:text-gray-200 hover:bg-gray-900"
                      }
                    `}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{t.title}</span>
                      <span className="text-[10px] text-gray-600 shrink-0">
                        {DIALECT_LABEL[t.dialect] ?? t.dialect}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-gray-600">{timeAgo(t.updated_at)}</span>
                      <span className="text-[11px] text-gray-700">·</span>
                      <span className="text-[11px] text-gray-600">{t.turn_count} turn{t.turn_count !== 1 ? "s" : ""}</span>
                      {t.category && t.category !== "General" && (
                        <span className="text-[10px] text-cyan-600 bg-cyan-900/20 px-1.5 py-0.5 rounded shrink-0">
                          {t.category}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-800">
        <p className="text-[11px] text-gray-600">Local · Private · Offline</p>
      </div>
    </aside>
  );
}
