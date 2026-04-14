import type { Dialect } from "../types";

const OPTIONS: { value: Dialect; label: string }[] = [
  { value: "postgresql", label: "PostgreSQL" },
  { value: "tsql",       label: "SQL Server / T-SQL" },
  { value: "mysql",      label: "MySQL" },
  { value: "sqlite",     label: "SQLite" },
];

interface Props {
  value: Dialect;
  onChange: (d: Dialect) => void;
}

export function DialectSelector({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Dialect)}
      className="
        bg-gray-800 text-gray-200 text-sm border border-gray-700 rounded-lg
        px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500
        cursor-pointer transition-colors hover:border-gray-600
      "
      aria-label="SQL dialect"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
