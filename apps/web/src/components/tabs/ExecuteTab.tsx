import { useState } from "react";

interface ExecuteResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  row_count: number;
  truncated: boolean;
  error: string | null;
}

interface Props {
  sql: string;
}

export function ExecuteTab({ sql }: Props) {
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/sql/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const data: ExecuteResult = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[#d4d4d4]">DuckDB Sandbox</p>
          <p className="text-xs text-[#8b949e]">Runs in an isolated in-memory database — no writes persist.</p>
        </div>
        <button
          onClick={run}
          disabled={running || !sql.trim()}
          className="flex items-center gap-1.5 rounded-lg border border-[#2a2d2e] bg-[#252526] px-3 py-1.5 text-xs text-[#d4d4d4] hover:border-[#007acc]/60 hover:text-[#9cdcfe] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? (
            <>
              <span className="w-2.5 h-2.5 border border-[#9cdcfe]/30 border-t-[#9cdcfe] rounded-full animate-spin" />
              Running…
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M3 3.732a1.5 1.5 0 0 1 2.305-1.265l6.706 4.267a1.5 1.5 0 0 1 0 2.531l-6.706 4.268A1.5 1.5 0 0 1 3 12.267V3.732z" />
              </svg>
              Run query
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-700/40 bg-red-900/20 px-3 py-2 text-xs text-red-300 font-mono">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-[#8b949e]">
            <span>{result.row_count.toLocaleString()} row{result.row_count !== 1 ? "s" : ""}</span>
            {result.truncated && (
              <span className="rounded border border-yellow-700/40 bg-yellow-900/20 px-1.5 py-0.5 text-yellow-400">
                truncated to 10 000
              </span>
            )}
          </div>

          {result.columns.length > 0 ? (
            <div className="overflow-auto rounded-lg border border-[#2a2d2e] max-h-96">
              <table className="min-w-full text-xs font-mono">
                <thead className="sticky top-0 bg-[#252526]">
                  <tr>
                    {result.columns.map((col) => (
                      <th
                        key={col}
                        className="border-b border-[#2a2d2e] px-3 py-2 text-left font-semibold text-[#9cdcfe] whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={ri % 2 === 0 ? "bg-[#1e1e1e]" : "bg-[#252526]"}
                    >
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="border-b border-[#2a2d2e]/50 px-3 py-1.5 text-[#d4d4d4] whitespace-nowrap max-w-xs truncate"
                          title={String(cell ?? "")}
                        >
                          {cell === null ? (
                            <span className="text-[#555] italic">NULL</span>
                          ) : (
                            String(cell)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-[#8b949e]">Query executed successfully — no rows returned.</p>
          )}
        </div>
      )}

      {!result && !error && !running && (
        <p className="text-xs text-[#555]">
          Click "Run query" to execute the current SQL against an in-memory DuckDB instance.
          Your schema must be defined in the query (e.g. via CTEs or <code className="text-[#8b949e]">CREATE TABLE AS</code>).
        </p>
      )}
    </div>
  );
}
