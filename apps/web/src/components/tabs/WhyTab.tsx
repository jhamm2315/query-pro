import { useState, useEffect, useRef } from "react";
import { sqlApi } from "../../lib/api";
import type { PlannerOutput } from "../../types";

interface Props {
  shortExplanation: string;
  sql: string;
  plan: PlannerOutput;
}

export function WhyTab({ shortExplanation, sql, plan }: Props) {
  const [expanded, setExpanded]     = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const fetchedRef                  = useRef(false);

  // Fetch the full explanation only when the user clicks "Go deeper"
  const handleExpand = async () => {
    setExpanded((v) => !v);
    if (fetchedRef.current || explanation !== null) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { explanation: text } = await sqlApi.fetchExplanation(sql, plan);
      setExplanation(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load explanation");
    } finally {
      setLoading(false);
    }
  };

  const paragraphs = (explanation ?? "").split("\n\n").filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Short summary — always visible, instant */}
      <div className="bg-brand-900/20 border border-brand-700/30 rounded-xl px-5 py-4">
        <p className="text-sm text-gray-200 leading-relaxed">{shortExplanation}</p>
      </div>

      {/* Expand toggle */}
      <button
        onClick={handleExpand}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
        </svg>
        {expanded ? "Collapse" : "Go deeper — full walk-through"}
      </button>

      {/* Full explanation — loaded on demand */}
      {expanded && (
        <div className="border-t border-gray-800 pt-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="w-4 h-4 border-2 border-gray-600 border-t-brand-400 rounded-full animate-spin" />
              Generating full walk-through…
            </div>
          )}
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          {!loading && !error && explanation !== null && (
            <div className="prose prose-invert prose-sm max-w-none space-y-4">
              {paragraphs.map((p, i) => {
                const lines = p.split("\n");
                if (lines[0].startsWith("###")) {
                  const heading = lines[0].replace(/^#{1,4}\s*/, "");
                  const body = lines.slice(1).join("\n");
                  return (
                    <div key={i}>
                      <h3 className="text-sm font-semibold text-brand-300 uppercase tracking-wide mb-2">
                        {heading}
                      </h3>
                      <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {body}
                      </div>
                    </div>
                  );
                }
                return (
                  <p key={i} className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {p}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
