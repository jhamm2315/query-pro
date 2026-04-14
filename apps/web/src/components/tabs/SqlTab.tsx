import { useState, useRef } from "react";
import type { Dialect } from "../../types";
import { libraryApi } from "../../lib/api";

interface Props {
  sql: string;
  optimizedSql?: string | null;
  dialect: Dialect;
  prompt?: string;
  onSaved?: () => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded-md hover:bg-gray-700 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function CodeBlock({ code, dialect }: { code: string; dialect: string }) {
  return (
    <div className="relative group">
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <CopyButton text={code} />
      </div>
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-950 border-b border-gray-700 rounded-t-lg">
        <span className="text-xs text-gray-500 font-mono">{dialect}</span>
      </div>
      <pre className="bg-gray-950 rounded-b-lg p-4 overflow-x-auto text-sm leading-relaxed">
        <code className="text-green-300 font-mono whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

function SaveForm({
  sql,
  dialect,
  prompt,
  onSaved,
  onCancel,
}: {
  sql: string;
  dialect: Dialect;
  prompt: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const defaultLabel = prompt.trim().slice(0, 60) || "Saved query";
  const [label, setLabel] = useState(defaultLabel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await libraryApi.save({ label: label.trim(), sql, prompt, dialect });
      onSaved();
    } catch {
      setError("Save failed — check the API is running.");
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-brand-900/20 border border-brand-700/40 rounded-lg">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4 text-brand-400 shrink-0"
      >
        <path
          fillRule="evenodd"
          d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
          clipRule="evenodd"
        />
      </svg>
      <input
        ref={inputRef}
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Label for this query…"
        className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
      <button
        onClick={handleSave}
        disabled={saving || !label.trim()}
        className="text-xs text-brand-300 hover:text-white font-medium px-2 py-1 rounded hover:bg-brand-800/40 transition-colors disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        onClick={onCancel}
        className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

export function SqlTab({ sql, optimizedSql, dialect, prompt = "", onSaved }: Props) {
  const [showOptimized, setShowOptimized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const activeSQL = showOptimized && optimizedSql ? optimizedSql : sql;

  const handleSaved = () => {
    setSaving(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 3000);
    onSaved?.();
  };

  return (
    <div className="space-y-3">
      {/* Toolbar row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {optimizedSql && (
            <>
              <button
                onClick={() => setShowOptimized(false)}
                className={`tab-btn ${!showOptimized ? "active" : ""}`}
              >
                Primary
              </button>
              <button
                onClick={() => setShowOptimized(true)}
                className={`tab-btn ${showOptimized ? "active" : ""}`}
              >
                Optimized
              </button>
            </>
          )}
        </div>

        {/* Save button */}
        {!saving && (
          <button
            onClick={() => { setSaving(true); setJustSaved(false); }}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              justSaved
                ? "border-brand-600 text-brand-300 bg-brand-900/20"
                : "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className={`w-3 h-3 ${justSaved ? "text-brand-400" : ""}`}
            >
              <path
                fillRule="evenodd"
                d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.575a.75.75 0 0 1-1.12.814L8 11.944l-3.136 1.05a.75.75 0 0 1-1.12-.814l.853-3.576L1.806 7.215a.75.75 0 0 1 .428-1.317l3.664-.293L7.308 2.21A.75.75 0 0 1 8 1.75z"
                clipRule="evenodd"
              />
            </svg>
            {justSaved ? "Saved!" : "Save"}
          </button>
        )}
      </div>

      {/* Inline save form */}
      {saving && (
        <SaveForm
          sql={activeSQL}
          dialect={dialect}
          prompt={prompt}
          onSaved={handleSaved}
          onCancel={() => setSaving(false)}
        />
      )}

      <CodeBlock code={activeSQL} dialect={dialect} />
    </div>
  );
}
