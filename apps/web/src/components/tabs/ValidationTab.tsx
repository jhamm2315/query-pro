import type { ValidateResponse, ValidationWarning, WarningSeverity } from "../../types";

interface Props {
  validation: ValidateResponse;
}

const SEVERITY_STYLES: Record<WarningSeverity, string> = {
  error:   "border-red-700 bg-red-900/20 text-red-300",
  warning: "border-yellow-700 bg-yellow-900/20 text-yellow-300",
  info:    "border-gray-700 bg-gray-800/50 text-gray-400",
};

const SEVERITY_ICON: Record<WarningSeverity, string> = {
  error:   "✕",
  warning: "⚠",
  info:    "ℹ",
};

function WarningCard({ w }: { w: ValidationWarning }) {
  return (
    <div className={`border rounded-lg px-4 py-3 ${SEVERITY_STYLES[w.severity]}`}>
      <div className="flex gap-2 items-start">
        <span className="text-sm font-bold shrink-0">{SEVERITY_ICON[w.severity]}</span>
        <div>
          <p className="text-xs font-mono font-semibold mb-0.5 opacity-75">{w.code}</p>
          <p className="text-sm">{w.message}</p>
        </div>
      </div>
    </div>
  );
}

export function ValidationTab({ validation }: Props) {
  const confidenceClass =
    validation.confidence === "high"   ? "badge-high"   :
    validation.confidence === "medium" ? "badge-medium" :
    "badge-low";

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`badge ${confidenceClass}`}>
          {validation.confidence.toUpperCase()} confidence
        </span>
        <span className={`badge ${validation.is_valid ? "badge-high" : "badge-low"}`}>
          {validation.is_valid ? "Valid SQL" : "Invalid SQL"}
        </span>
        <span className={`badge ${validation.parsed_ok ? "badge-high" : "badge-low"}`}>
          {validation.parsed_ok ? "Parsed OK" : "Parse failed"}
        </span>
      </div>

      {/* Rationale */}
      {validation.confidence_rationale && (
        <p className="text-sm text-gray-400 italic">{validation.confidence_rationale}</p>
      )}

      {/* Warnings */}
      {validation.warnings.length === 0 ? (
        <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-3">
          <p className="text-sm text-green-300">No warnings detected. SQL looks structurally sound.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {validation.warnings.map((w, i) => (
            <WarningCard key={i} w={w} />
          ))}
        </div>
      )}
    </div>
  );
}
