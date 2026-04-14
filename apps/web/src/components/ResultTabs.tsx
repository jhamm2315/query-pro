import { useState } from "react";
import type { GenerateResponse } from "../types";
import { PlanTab }        from "./tabs/PlanTab";
import { SqlTab }         from "./tabs/SqlTab";
import { WhyTab }         from "./tabs/WhyTab";
import { ValidationTab }  from "./tabs/ValidationTab";
import { MeetingTab }     from "./tabs/MeetingTab";
import { ReviewTab }      from "./tabs/ReviewTab";
import { QueryCardBuilder } from "./QueryCardBuilder";

type Tab = "plan" | "sql" | "builder" | "why" | "validation" | "meeting" | "review";

const TABS: { id: Tab; label: string }[] = [
  { id: "meeting",    label: "Meeting mode" },
  { id: "sql",        label: "SQL" },
  { id: "review",     label: "Review & Fix" },
  { id: "builder",    label: "Card Builder" },
  { id: "plan",       label: "Plan" },
  { id: "why",        label: "Why it works" },
  { id: "validation", label: "Validation" },
];

interface Props {
  result: GenerateResponse;
  onNewSql?: (sql: string) => void;
  onSaved?: () => void;
}

export function ResultTabs({ result, onNewSql, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("meeting");
  const [displaySql, setDisplaySql] = useState(result.sql);

  const errorCount = result.validation.warnings.filter((w) => w.severity === "error").length;
  const warnCount  = result.validation.warnings.filter((w) => w.severity === "warning").length;

  const handleNewSql = (sql: string) => {
    setDisplaySql(sql);
    setActiveTab("sql");
    onNewSql?.(sql);
  };

  const confidenceBadge =
    result.validation.confidence === "high"   ? "badge-high" :
    result.validation.confidence === "medium" ? "badge-medium" :
    "badge-low";

  return (
    <div className="card mt-4">
      {/* Short explanation — always visible above tabs */}
      {result.short_explanation && (
        <div className="mb-4 px-1 py-2 border-b border-gray-800/60 flex items-start gap-3">
          <span className={`badge ${confidenceBadge} shrink-0 mt-0.5`}>
            {result.validation.confidence}
          </span>
          <p className="text-sm text-gray-300 leading-relaxed">{result.short_explanation}</p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-gray-800 mb-5 overflow-x-auto pb-px">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-btn flex items-center gap-1.5 whitespace-nowrap ${activeTab === tab.id ? "active" : ""}`}
          >
            {tab.id === "builder" && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M2 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2zM2 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7zM7 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V2zM7 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7zM12 2a1 1 0 0 1 1-1h.5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H13a1 1 0 0 1-1-1V2zM12 7a1 1 0 0 1 1-1h.5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H13a1 1 0 0 1-1-1V7z" />
              </svg>
            )}
            {tab.id === "meeting" && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM4.75 7.75a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5z" clipRule="evenodd" />
              </svg>
            )}
            {tab.label}
            {tab.id === "validation" && (errorCount + warnCount > 0) && (
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                errorCount > 0 ? "bg-red-600 text-white" : "bg-yellow-600 text-white"
              }`}>
                {errorCount + warnCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-40">
        {activeTab === "sql" && (
          <SqlTab
            sql={displaySql}
            optimizedSql={result.optimized_sql}
            dialect={result.dialect}
            prompt={result.plan.user_prompt}
            onSaved={onSaved}
          />
        )}
        {activeTab === "builder" && (
          <QueryCardBuilder
            plan={result.plan}
            dialect={result.dialect}
            threadId={result.thread_id}
            onNewSql={handleNewSql}
          />
        )}
        {activeTab === "plan" && <PlanTab plan={result.plan} />}
        {activeTab === "why" && (
          <WhyTab
            shortExplanation={result.short_explanation}
            sql={result.sql}
            plan={result.plan}
          />
        )}
        {activeTab === "validation" && <ValidationTab validation={result.validation} />}
        {activeTab === "meeting" && <MeetingTab result={result} />}
        {activeTab === "review" && (
          <ReviewTab initialSql={displaySql} dialect={result.dialect} />
        )}
      </div>
    </div>
  );
}
