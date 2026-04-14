/**
 * ReviewTab — paste or auto-load SQL, get bugs + fixed version + summary.
 */
import { useState } from "react";
import type { Dialect } from "../../types";
import { reviewApi } from "../../lib/api";

interface Props {
  initialSql: string;
  dialect: Dialect;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
      className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-700 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function ReviewTab({ initialSql, dialect }: Props) {
  const [sql, setSql]         = useState(initialSql);
  const [result, setResult]   = useState<import("../../types").ReviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const run = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setResult(await reviewApi.review(sql.trim(), dialect));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* SQL input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">SQL to review</p>
          <span className="text-[11px] text-gray-600 font-mono">{dialect}</span>
        </div>
        <textarea
          value={sql}
          onChange={(e) => { setSql(e.target.value); setResult(null); }}
          rows={7}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-sm text-green-300 font-mono leading-relaxed focus:outline-none focus:border-brand-500 resize-none"
          placeholder="Paste any SQL here, or use the auto-loaded query above…"
          spellCheck={false}
        />
        <button
          onClick={run}
          disabled={loading || !sql.trim()}
          className="flex items-center gap-2 bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
        >
          {loading ? (
            <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Reviewing…</>
          ) : (
            <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75zm-2.546-4.46a.75.75 0 0 1 0 1.06l-3.53 3.53a.75.75 0 0 1-1.06 0l-1.72-1.72a.75.75 0 1 1 1.06-1.06l1.19 1.19 3-3a.75.75 0 0 1 1.06 0z" clipRule="evenodd" /></svg>Find Bugs & Fix</>
          )}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {result && (
        <div className="space-y-4 border-t border-gray-800 pt-4">
          {/* Summary */}
          {result.summary && (
            <div className="bg-brand-900/20 border border-brand-700/30 rounded-xl px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-400 mb-1.5">Summary</p>
              <p className="text-sm text-gray-200 leading-relaxed">{result.summary}</p>
            </div>
          )}

          {/* Issues */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Issues Found</p>
            {result.structural_warnings.length === 0 && !result.issues_text ? (
              <p className="text-sm text-green-400">✓ No issues found</p>
            ) : (
              <div className="space-y-1.5">
                {result.structural_warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2">
                    <span className="text-yellow-400 shrink-0">⚠</span>
                    <span className="text-yellow-200 font-mono">{w}</span>
                  </div>
                ))}
                {result.issues_text && (
                  <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap bg-gray-900/50 rounded-lg px-4 py-3 border border-gray-800">
                    {result.issues_text}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fixed SQL */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Fixed SQL {result.has_changes ? <span className="text-brand-400 normal-case font-normal ml-1">· changes applied</span> : <span className="text-gray-600 normal-case font-normal ml-1">· no changes needed</span>}
              </p>
              <CopyButton text={result.fixed_sql} />
            </div>
            <div className="relative group">
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-950 border-b border-gray-700 rounded-t-lg">
                <span className="text-xs text-gray-500 font-mono">{result.dialect}</span>
                {result.has_changes && <span className="text-[10px] text-brand-400 bg-brand-900/30 px-1.5 py-0.5 rounded">fixed</span>}
              </div>
              <pre className="bg-gray-950 rounded-b-lg p-4 overflow-x-auto text-sm leading-relaxed">
                <code className="text-green-300 font-mono whitespace-pre">{result.fixed_sql}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
