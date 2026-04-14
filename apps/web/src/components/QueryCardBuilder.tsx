/**
 * QueryCardBuilder — UI Pro Max
 *
 * Displays each SQL plan component as a selectable card chip.
 * User toggles chips → "Build Query" sends the selections back
 * as a natural-language prompt to regenerate SQL instantly.
 */

import { useState, useCallback } from "react";
import type { PlannerOutput, Dialect } from "../types";
import { sqlApi } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type CardCategory =
  | "grain"
  | "table"
  | "pattern"
  | "filter"
  | "aggregation"
  | "window"
  | "group"
  | "sort";

interface CardItem {
  id: string;
  category: CardCategory;
  label: string;
  sublabel?: string;
  selected: boolean;
}

// ─── Category metadata ────────────────────────────────────────────────────────

const CAT_META: Record<CardCategory, { label: string; color: string; icon: string }> = {
  grain:       { label: "Row Grain",       color: "border-brand-600 bg-brand-900/20 text-brand-300",    icon: "⬛" },
  table:       { label: "Tables",          color: "border-violet-600 bg-violet-900/20 text-violet-300", icon: "🗄" },
  pattern:     { label: "Patterns",        color: "border-cyan-600 bg-cyan-900/20 text-cyan-300",       icon: "⚡" },
  filter:      { label: "Filters",         color: "border-orange-600 bg-orange-900/20 text-orange-300", icon: "⛛" },
  aggregation: { label: "Aggregations",    color: "border-green-600 bg-green-900/20 text-green-300",    icon: "∑" },
  window:      { label: "Window Fns",      color: "border-pink-600 bg-pink-900/20 text-pink-300",       icon: "⊟" },
  group:       { label: "Group By",        color: "border-yellow-600 bg-yellow-900/20 text-yellow-300", icon: "≡" },
  sort:        { label: "Sort",            color: "border-teal-600 bg-teal-900/20 text-teal-300",       icon: "↕" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function planToCards(plan: PlannerOutput): CardItem[] {
  const cards: CardItem[] = [];
  let id = 0;
  const push = (category: CardCategory, label: string, sublabel?: string, selected = true) =>
    cards.push({ id: String(id++), category, label, sublabel, selected });

  if (plan.grain) push("grain", plan.grain, undefined, true);
  plan.tables.forEach((t) => push("table", t));
  plan.patterns.forEach((p) => push("pattern", p));
  plan.filters.forEach((f) => push("filter", f));
  plan.aggregations.forEach((a) => push("aggregation", a));
  plan.window_functions.forEach((w) => push("window", w));
  plan.group_by.forEach((g) => push("group", g));
  plan.order_by.forEach((o) => push("sort", o));

  return cards;
}

function cardsToPrompt(cards: CardItem[], originalPrompt: string): string {
  const selected = cards.filter((c) => c.selected && c.category !== "grain");
  const tables  = selected.filter((c) => c.category === "table").map((c) => c.label);
  const filters = selected.filter((c) => c.category === "filter").map((c) => c.label);
  const aggs    = selected.filter((c) => c.category === "aggregation").map((c) => c.label);
  const windows = selected.filter((c) => c.category === "window").map((c) => c.label);
  const groups  = selected.filter((c) => c.category === "group").map((c) => c.label);
  const sorts   = selected.filter((c) => c.category === "sort").map((c) => c.label);
  const patterns = selected.filter((c) => c.category === "pattern").map((c) => c.label);

  const parts = [`Based on: "${originalPrompt}"`];
  if (tables.length)  parts.push(`Tables: ${tables.join(", ")}`);
  if (patterns.length) parts.push(`Using patterns: ${patterns.join(", ")}`);
  if (filters.length) parts.push(`Filters: ${filters.join("; ")}`);
  if (aggs.length)    parts.push(`Aggregations: ${aggs.join(", ")}`);
  if (windows.length) parts.push(`Window functions: ${windows.join(", ")}`);
  if (groups.length)  parts.push(`Group by: ${groups.join(", ")}`);
  if (sorts.length)   parts.push(`Order by: ${sorts.join(", ")}`);

  return parts.join(". ") + ". Generate SQL for this.";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chip({
  item,
  onToggle,
  readonly,
}: {
  item: CardItem;
  onToggle: (id: string) => void;
  readonly?: boolean;
}) {
  const meta = CAT_META[item.category];
  const base = `
    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium
    transition-all duration-150 select-none
  `;
  const active = item.selected
    ? meta.color
    : "border-gray-700 bg-gray-800/40 text-gray-500";
  const cursor = readonly ? "cursor-default" : "cursor-pointer hover:opacity-90 active:scale-95";

  return (
    <button
      type="button"
      onClick={() => !readonly && onToggle(item.id)}
      className={`${base} ${active} ${cursor}`}
      title={item.sublabel ?? item.label}
    >
      {!readonly && (
        <span className={`w-3 h-3 rounded-sm border flex items-center justify-center text-[9px] shrink-0 ${
          item.selected ? "bg-current border-current text-gray-900" : "border-gray-600"
        }`}>
          {item.selected ? "✓" : ""}
        </span>
      )}
      <span className="truncate max-w-[180px]">{item.label}</span>
    </button>
  );
}

function CardSection({
  category,
  items,
  onToggle,
}: {
  category: CardCategory;
  items: CardItem[];
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const meta = CAT_META[category];
  const readonly = category === "grain";

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">
        {meta.icon} {meta.label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Chip key={item.id} item={item} onToggle={onToggle} readonly={readonly} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  plan: PlannerOutput;
  dialect: Dialect;
  threadId: string;
  onNewSql: (sql: string) => void;
}

export function QueryCardBuilder({ plan, dialect, threadId, onNewSql }: Props) {
  const [cards, setCards] = useState<CardItem[]>(() => planToCards(plan));
  const [building, setBuilding] = useState(false);
  const [builtSql, setBuiltSql] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggle = useCallback((id: string) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
    setBuiltSql(null);
  }, []);

  const selectAll = () => {
    setCards((prev) => prev.map((c) => ({ ...c, selected: true })));
    setBuiltSql(null);
  };

  const clearAll = () => {
    setCards((prev) =>
      prev.map((c) => ({ ...c, selected: c.category === "grain" ? true : false }))
    );
    setBuiltSql(null);
  };

  const buildQuery = async () => {
    const selectedCount = cards.filter((c) => c.selected && c.category !== "grain").length;
    if (selectedCount === 0) return;

    setBuilding(true);
    setBuiltSql(null);
    try {
      const prompt = cardsToPrompt(cards, plan.user_prompt);
      const res = await sqlApi.generate({ prompt, dialect, thread_id: threadId });
      setBuiltSql(res.sql);
      onNewSql(res.sql);
    } catch {
      setBuiltSql("-- Build failed. Check Ollama is running.");
    } finally {
      setBuilding(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const categories: CardCategory[] = [
    "grain", "table", "pattern", "filter", "aggregation", "window", "group", "sort",
  ];

  const selectedCount = cards.filter((c) => c.selected && c.category !== "grain").length;
  const totalSelectable = cards.filter((c) => c.category !== "grain").length;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Query Card Builder</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Toggle components → Build SQL from selection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">
            {selectedCount}/{totalSelectable} selected
          </span>
          <button onClick={selectAll} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded border border-gray-700 hover:border-gray-600 transition-colors">
            All
          </button>
          <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded border border-gray-700 hover:border-gray-600 transition-colors">
            Clear
          </button>
        </div>
      </div>

      {/* Card grid */}
      <div className="space-y-3">
        {categories.map((cat) => (
          <CardSection
            key={cat}
            category={cat}
            items={cards.filter((c) => c.category === cat)}
            onToggle={toggle}
          />
        ))}
      </div>

      {/* Build button */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
        <button
          onClick={buildQuery}
          disabled={building || selectedCount === 0}
          className="
            flex items-center gap-2 bg-brand-700 hover:bg-brand-600
            text-white text-sm font-medium px-4 py-2 rounded-lg
            transition-colors disabled:opacity-40 disabled:cursor-not-allowed
            focus:outline-none focus:ring-2 focus:ring-brand-500
          "
        >
          {building ? (
            <>
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Building…
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M3 3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H3zm3.293 4.293a1 1 0 0 1 1.414 0L10 10.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-3 3a1 1 0 0 1-1.414 0l-3-3a1 1 0 0 1 0-1.414z" clipRule="evenodd" />
              </svg>
              Build SQL from selections
            </>
          )}
        </button>
        <span className="text-xs text-gray-600">
          Rebuilds using only the checked components
        </span>
      </div>

      {/* Built SQL output */}
      {builtSql && (
        <div className="relative group mt-2">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-950 border border-gray-700 rounded-t-lg">
            <span className="text-xs text-gray-400 font-mono">rebuilt · {dialect}</span>
            <button
              onClick={() => copy(builtSql)}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="bg-gray-950 border border-t-0 border-gray-700 rounded-b-lg p-4 overflow-x-auto text-sm leading-relaxed">
            <code className="text-green-300 font-mono whitespace-pre">{builtSql}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
