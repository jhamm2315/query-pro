import { useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function SchemaUpload({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#d4d4d4] transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L9.19 8 6.22 5.03a.75.75 0 0 1 0-1.06z"
            clipRule="evenodd"
          />
        </svg>
        Schema context
        {value.trim() && (
          <span className="ml-1 rounded-full bg-[#007acc]/20 border border-[#007acc]/40 px-1.5 py-0.5 text-[10px] text-[#9cdcfe]">
            active
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-1">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={5}
            placeholder={`Paste DDL or CSV headers for context, e.g.\n\nCREATE TABLE orders (id INT, customer_id INT, total DECIMAL, created_at TIMESTAMP);\nCREATE TABLE customers (id INT, name TEXT, region TEXT);`}
            className="w-full bg-[#1e1e1e] border border-[#2a2d2e] rounded-lg px-3 py-2 text-xs text-[#d4d4d4] font-mono placeholder-[#555] resize-y focus:outline-none focus:border-[#007acc]/60 leading-relaxed"
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-[#555]">
              DDL, CSV headers, or a plain table list — the model will use this as schema context.
            </p>
            {value.trim() && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="text-[10px] text-[#8b949e] hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
