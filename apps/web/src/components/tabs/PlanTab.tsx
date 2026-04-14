import type { PlannerOutput } from "../../types";

interface Props {
  plan: PlannerOutput;
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{title}</h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-300">
            <span className="text-brand-400 mt-0.5 shrink-0">›</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-gray-800 text-gray-300 border border-gray-700">
      {label}
    </span>
  );
}

export function PlanTab({ plan }: Props) {
  return (
    <div className="space-y-5">
      {/* Meta row */}
      <div className="flex flex-wrap gap-2 items-center">
        {plan.query_type && <Chip label={plan.query_type} />}
        {plan.dialect && <Chip label={plan.dialect} />}
        {plan.patterns.map((p) => <Chip key={p} label={p} />)}
      </div>

      {/* Grain */}
      {plan.grain && (
        <div className="bg-brand-900/20 border border-brand-700/30 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-brand-300 uppercase tracking-wider mb-1">Row grain</p>
          <p className="text-sm text-gray-200">{plan.grain}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Section title="Tables" items={plan.tables} />
        <Section title="Join keys" items={plan.join_keys} />
        <Section title="Joins" items={plan.joins} />
        <Section title="Filters" items={plan.filters} />
        <Section title="Aggregations" items={plan.aggregations} />
        <Section title="Window functions" items={plan.window_functions} />
        <Section title="Group by" items={plan.group_by} />
        <Section title="Order by" items={plan.order_by} />
        <Section title="Output columns" items={plan.output_columns} />
        <Section title="Optimization notes" items={plan.optimization_notes} />
      </div>

      <Section title="Assumptions" items={plan.assumptions} />
      <Section title="Ambiguities" items={plan.ambiguities} />
      <Section title="Verification checks" items={plan.verification_checks} />

      {plan.confidence_rationale && (
        <div className="text-xs text-gray-500 italic border-t border-gray-800 pt-3">
          {plan.confidence_rationale}
        </div>
      )}
    </div>
  );
}
