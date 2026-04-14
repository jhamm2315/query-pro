import { useState, useRef } from "react";
import type { GenerateResponse } from "../../types";
import { sqlApi } from "../../lib/api";
import { MeetingChat, createMeetingSessionState } from "../MeetingChat";

interface Props {
  result: GenerateResponse;
}

export function MeetingTab({ result }: Props) {
  const [summary, setSummary]   = useState<string>(result.meeting_mode);
  const [summaryLoading, setSummaryLoading] = useState(!result.meeting_mode);
  const [summaryOpen, setSummaryOpen]       = useState(false);
  const [session, setSession] = useState(() =>
    createMeetingSessionState(result.plan, result.meeting_mode)
  );
  const fetchedRef = useRef(!!result.meeting_mode);

  // Fire the summary fetch without blocking the chat render
  if (!fetchedRef.current) {
    fetchedRef.current = true;
    sqlApi
      .fetchMeetingSummary(result.sql, result.plan)
      .then(({ meeting_mode }) => {
        setSummary(meeting_mode);
        setSummaryLoading(false);
      })
      .catch(() => setSummaryLoading(false));
  }

  return (
    <div className="space-y-3">
      {/* Collapsible context summary — loads behind the chat */}
      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setSummaryOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-900/60 hover:bg-gray-900 transition-colors text-left"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-brand-500">
              <path fillRule="evenodd" d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4zm6.5 1.5a.5.5 0 0 0-1 0v1h-1a.5.5 0 0 0 0 1h1v1a.5.5 0 0 0 1 0v-1h1a.5.5 0 0 0 0-1h-1v-1z" clipRule="evenodd" />
            </svg>
            Query context
            {summaryLoading && (
              <span className="w-3 h-3 border border-gray-600 border-t-brand-400 rounded-full animate-spin" />
            )}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`w-3.5 h-3.5 text-gray-500 transition-transform ${summaryOpen ? "" : "-rotate-90"}`}
          >
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
          </svg>
        </button>

        {summaryOpen && (
          <div className="px-4 py-3 text-sm text-gray-300 leading-relaxed border-t border-gray-800 bg-gray-950/40">
            {summaryLoading
              ? <span className="text-gray-500 italic">Generating plain-English summary…</span>
              : summary || <span className="text-gray-500 italic">No summary available.</span>
            }
          </div>
        )}
      </div>

      {/* Chat — renders immediately, Y/N flow starts right away */}
      <MeetingChat
        threadId={result.thread_id}
        turnId={result.turn_id}
        sql={result.sql}
        plan={result.plan}
        session={session}
        setSession={setSession}
      />
    </div>
  );
}
