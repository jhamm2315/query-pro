import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  BankQuery,
  Dialect,
  GenerateResponse,
  MeetingSessionState,
  PlannerOutput,
  SavedQuery,
  ThreadDetail,
  ValidateResponse,
} from "./types";
import { Sidebar } from "./components/Sidebar";
import { PromptInput } from "./components/PromptInput";
import { useGenerate } from "./hooks/useGenerate";
import { useHistory } from "./hooks/useHistory";
import { useLibrary } from "./hooks/useLibrary";
import { historyApi, libraryApi } from "./lib/api";
import { SqlTab } from "./components/tabs/SqlTab";
import { QueryCardBuilder } from "./components/QueryCardBuilder";
import { PlanTab } from "./components/tabs/PlanTab";
import { ValidationTab } from "./components/tabs/ValidationTab";
import { WhyTab } from "./components/tabs/WhyTab";
import { ReviewTab } from "./components/tabs/ReviewTab";
import { MeetingChat, createMeetingSessionState } from "./components/MeetingChat";

type ExplorerView = "threads" | "templates" | "saved";
type InspectorView = "plan" | "validation" | "why" | "builder" | "review";

interface WorkspaceDocument {
  source: "generated" | "history" | "saved" | "template";
  title: string;
  threadId: string | null;
  turnId?: string;
  prompt: string;
  dialect: Dialect;
  sql: string;
  optimizedSql?: string | null;
  shortExplanation: string;
  explanation: string;
  meetingMode: string;
  confirmedAssumptions: string[];
  plan?: PlannerOutput;
  validation?: ValidateResponse;
}

const EMPTY_PLAN = (prompt: string, dialect: Dialect): PlannerOutput => ({
  user_prompt: prompt,
  cleaned_prompt: prompt,
  dialect,
  query_type: "historical-thread",
  grain: "",
  tables: [],
  join_keys: [],
  joins: [],
  filters: [],
  aggregations: [],
  window_functions: [],
  group_by: [],
  order_by: [],
  patterns: [],
  output_columns: [],
  assumptions: [],
  ambiguities: [],
  verification_checks: [],
  optimization_notes: [],
  confidence_rationale: "",
});

function workspaceFromGenerate(result: GenerateResponse): WorkspaceDocument {
  return {
    source: "generated",
    title: result.plan.user_prompt.slice(0, 60) || "Generated query",
    threadId: result.thread_id,
    turnId: result.turn_id,
    prompt: result.plan.user_prompt,
    dialect: result.dialect,
    sql: result.sql,
    optimizedSql: result.optimized_sql,
    shortExplanation: result.short_explanation,
    explanation: result.explanation,
    meetingMode: result.meeting_mode,
    confirmedAssumptions: [],
    plan: result.plan,
    validation: result.validation,
  };
}

function workspaceFromThread(detail: ThreadDetail): WorkspaceDocument | null {
  const latestTurn = detail.turns[detail.turns.length - 1];
  if (!latestTurn) return null;

  return {
    source: "history",
    title: detail.title,
    threadId: detail.thread_id,
    turnId: latestTurn.turn_id,
    prompt: latestTurn.prompt,
    dialect: latestTurn.dialect,
    sql: latestTurn.sql,
    shortExplanation: latestTurn.explanation || "Thread loaded from history.",
    explanation: latestTurn.explanation,
    meetingMode: latestTurn.meeting_mode,
    confirmedAssumptions: latestTurn.confirmed_assumptions,
    plan: EMPTY_PLAN(latestTurn.prompt, latestTurn.dialect),
  };
}

function workspaceFromSaved(saved: SavedQuery): WorkspaceDocument {
  return {
    source: "saved",
    title: saved.label,
    threadId: null,
    prompt: saved.prompt,
    dialect: saved.dialect,
    sql: saved.sql,
    shortExplanation: "Saved query loaded into the editor workspace.",
    explanation: "",
    meetingMode: "Saved query loaded. You can ask follow-up questions or regenerate from the original prompt.",
    confirmedAssumptions: [],
    plan: EMPTY_PLAN(saved.prompt, saved.dialect),
  };
}

function workspaceFromTemplate(query: BankQuery): WorkspaceDocument {
  return {
    source: "template",
    title: query.name,
    threadId: null,
    prompt: query.description,
    dialect: query.dialect,
    sql: query.sql,
    shortExplanation: query.use_case,
    explanation: query.use_case,
    meetingMode: "Template loaded. Use it as a starting point, then regenerate to tailor it to your schema.",
    confirmedAssumptions: [],
    plan: EMPTY_PLAN(query.description, query.dialect),
  };
}

function RailButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rail-btn ${active ? "active" : ""}`}
    >
      {children}
    </button>
  );
}

function PanelHeader({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="panel-header">
      <div>
        <p className="panel-kicker">{title}</p>
        {meta && <p className="panel-meta">{meta}</p>}
      </div>
      {actions}
    </div>
  );
}

function EmptyWorkspace() {
  return (
    <div className="flex h-full items-center justify-center px-8 text-center">
      <div className="max-w-lg space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2a2d2e] bg-[#252526]">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 text-[#569cd6]">
            <path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.25a.75.75 0 0 0 1 .707A8.237 8.237 0 0 1 6 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0 1 18 18.75c.966 0 1.89.166 2.75.47a.75.75 0 0 0 1-.708V4.262a.75.75 0 0 0-.5-.707A9.735 9.735 0 0 0 18 3a9.707 9.707 0 0 0-5.25 1.533v16.103z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-[#d4d4d4]">Open a thread or generate a query</h2>
          <p className="text-sm leading-relaxed text-[#8b949e]">
            The workspace keeps SQL, meeting mode, and inspectors synchronized so you can review the query while the conversation is still moving.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { generate, loading, error } = useGenerate();
  const { threads, refresh: refreshHistory } = useHistory();
  const { savedQueries, refresh: refreshLibrary } = useLibrary();

  const [workspace, setWorkspace] = useState<WorkspaceDocument | null>(null);
  const [meetingSession, setMeetingSession] = useState<MeetingSessionState>(
    createMeetingSessionState(EMPTY_PLAN("", "postgresql"))
  );
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [fillPrompt, setFillPrompt] = useState("");
  const [explorerView, setExplorerView] = useState<ExplorerView>("threads");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [inspectorView, setInspectorView] = useState<InspectorView>("plan");
  const [threadLoadingId, setThreadLoadingId] = useState<string | null>(null);
  const [sqlPaneRatio, setSqlPaneRatio] = useState(0.58);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const splitWorkspaceRef = useRef<HTMLDivElement | null>(null);

  const resetWorkspace = useCallback((nextWorkspace: WorkspaceDocument | null) => {
    setWorkspace(nextWorkspace);
    if (!nextWorkspace) {
      setMeetingSession(createMeetingSessionState(EMPTY_PLAN("", "postgresql")));
      return;
    }

    setMeetingSession(
      createMeetingSessionState(
        nextWorkspace.plan ?? EMPTY_PLAN(nextWorkspace.prompt, nextWorkspace.dialect),
        nextWorkspace.meetingMode,
        nextWorkspace.confirmedAssumptions
      )
    );
  }, []);

  const handleSubmit = useCallback(
    async (prompt: string, dialect: Dialect) => {
      const result = await generate({
        prompt,
        dialect,
        thread_id: activeThreadId ?? undefined,
      });

      if (!result) return;

      const nextWorkspace = workspaceFromGenerate(result);
      startTransition(() => {
        setActiveThreadId(result.thread_id);
        setInspectorView("plan");
        setRightPanelOpen(true);
        setBottomPanelOpen(true);
        resetWorkspace(nextWorkspace);
      });
      refreshHistory();
    },
    [activeThreadId, generate, refreshHistory, resetWorkspace]
  );

  const handleNewThread = useCallback(() => {
    setActiveThreadId(null);
    setFillPrompt("");
    resetWorkspace(null);
  }, [resetWorkspace]);

  const handleSelectThread = useCallback(
    async (threadId: string) => {
      setThreadLoadingId(threadId);
      try {
        const detail = await historyApi.getThread(threadId);
        const hydrated = workspaceFromThread(detail);

        startTransition(() => {
          setActiveThreadId(threadId);
          setBottomPanelOpen(true);
          setRightPanelOpen(true);
          setInspectorView(hydrated?.plan ? "plan" : "why");
          resetWorkspace(hydrated);
        });
      } finally {
        setThreadLoadingId(null);
      }
    },
    [resetWorkspace]
  );

  const handleRecall = useCallback(
    (saved: SavedQuery) => {
      setActiveThreadId(null);
      setFillPrompt(saved.prompt);
      setRightPanelOpen(true);
      setBottomPanelOpen(true);
      resetWorkspace(workspaceFromSaved(saved));
    },
    [resetWorkspace]
  );

  const handleUnsave = useCallback(
    async (id: string) => {
      await libraryApi.remove(id);
      refreshLibrary();
      if (workspace?.source === "saved" && workspace.title === savedQueries.find((q) => q.id === id)?.label) {
        resetWorkspace(null);
      }
    },
    [refreshLibrary, resetWorkspace, savedQueries, workspace]
  );

  const handleLoadBankQuery = useCallback(
    (query: BankQuery) => {
      setActiveThreadId(null);
      setFillPrompt(query.description);
      setExplorerView("templates");
      setRightPanelOpen(true);
      resetWorkspace(workspaceFromTemplate(query));
    },
    [resetWorkspace]
  );

  const activePlan = workspace?.plan ?? EMPTY_PLAN(workspace?.prompt ?? "", workspace?.dialect ?? "postgresql");
  const panelMeta = useMemo(() => {
    if (!workspace) return "No active query";
    const source = workspace.source === "generated"
      ? "Live result"
      : workspace.source === "history"
        ? "Thread history"
        : workspace.source === "saved"
          ? "Saved query"
          : "Template";
    return `${source} · ${workspace.dialect}`;
  }, [workspace]);

  const confirmedCount = meetingSession.confirmedAssumptions.filter((item) => !item.startsWith("[FLAGGED]")).length;
  const flaggedCount = meetingSession.confirmedAssumptions.length - confirmedCount;
  const validationCount = workspace?.validation
    ? workspace.validation.warnings.filter((warning) => warning.severity !== "info").length
    : 0;

  useEffect(() => {
    if (!draggingSplit) return;

    const handlePointerMove = (event: MouseEvent) => {
      const container = splitWorkspaceRef.current;
      if (!container) return;

      const bounds = container.getBoundingClientRect();
      const nextRatio = (event.clientX - bounds.left) / bounds.width;
      setSqlPaneRatio(Math.min(0.78, Math.max(0.28, nextRatio)));
    };

    const stopDragging = () => setDraggingSplit(false);

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", stopDragging);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", stopDragging);
    };
  }, [draggingSplit]);

  return (
    <div className="app-frame">
      <aside className="activity-rail">
        <div className="flex flex-col gap-2">
          <RailButton
            active={leftPanelOpen && explorerView === "threads"}
            label="Threads"
            onClick={() => {
              setExplorerView("threads");
              setLeftPanelOpen((prev) => (explorerView === "threads" ? !prev : true));
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M3 5.75A2.75 2.75 0 0 1 5.75 3h8.5A2.75 2.75 0 0 1 17 5.75v8.5A2.75 2.75 0 0 1 14.25 17h-8.5A2.75 2.75 0 0 1 3 14.25v-8.5z" />
            </svg>
          </RailButton>
          <RailButton
            active={leftPanelOpen && explorerView === "saved"}
            label="Saved"
            onClick={() => {
              setExplorerView("saved");
              setLeftPanelOpen((prev) => (explorerView === "saved" ? !prev : true));
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M9.664 1.319a.75.75 0 0 1 .672 0l7.25 3.625A.75.75 0 0 1 18 5.625v8.75a.75.75 0 0 1-.414.67l-7.25 3.625a.75.75 0 0 1-.672 0l-7.25-3.625A.75.75 0 0 1 2 14.375v-8.75a.75.75 0 0 1 .414-.67l7.25-3.625zM10 2.828 4.172 5.75 10 8.672l5.828-2.922L10 2.828z" clipRule="evenodd" />
            </svg>
          </RailButton>
          <RailButton
            active={leftPanelOpen && explorerView === "templates"}
            label="Templates"
            onClick={() => {
              setExplorerView("templates");
              setLeftPanelOpen((prev) => (explorerView === "templates" ? !prev : true));
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M4.75 2A1.75 1.75 0 0 0 3 3.75v12.5C3 17.216 3.784 18 4.75 18h10.5c.966 0 1.75-.784 1.75-1.75V6.56a1.75 1.75 0 0 0-.513-1.237l-2.81-2.81A1.75 1.75 0 0 0 12.44 2H4.75z" />
            </svg>
          </RailButton>
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <RailButton
            active={rightPanelOpen}
            label="Inspector"
            onClick={() => setRightPanelOpen((prev) => !prev)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M3 4.75A1.75 1.75 0 0 1 4.75 3h10.5A1.75 1.75 0 0 1 17 4.75v10.5A1.75 1.75 0 0 1 15.25 17H4.75A1.75 1.75 0 0 1 3 15.25V4.75zm8 0v10.5h4.25a.25.25 0 0 0 .25-.25V5a.25.25 0 0 0-.25-.25H11z" />
            </svg>
          </RailButton>
          <RailButton
            active={bottomPanelOpen}
            label="Meeting panel"
            onClick={() => setBottomPanelOpen((prev) => !prev)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M4.75 3A1.75 1.75 0 0 0 3 4.75v6.5C3 12.216 3.784 13 4.75 13h10.5c.966 0 1.75-.784 1.75-1.75v-6.5A1.75 1.75 0 0 0 15.25 3H4.75zM6 15.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75z" clipRule="evenodd" />
            </svg>
          </RailButton>
        </div>
      </aside>

      {leftPanelOpen && (
        <div className="explorer-panel">
          <Sidebar
            threads={threads}
            activeThreadId={threadLoadingId ?? activeThreadId}
            onSelect={handleSelectThread}
            onNew={handleNewThread}
            savedQueries={savedQueries}
            onRecall={handleRecall}
            onUnsave={handleUnsave}
            onLoadBankQuery={handleLoadBankQuery}
          />
        </div>
      )}

      <main className="workspace-shell">
        <header className="workspace-topbar">
          <div>
            <h1 className="text-sm font-semibold text-[#d4d4d4]">Query Pro</h1>
            <p className="text-xs text-[#8b949e]">Minimal local-first workspace with synchronized meeting, SQL, and review panels.</p>
          </div>
          <div className="workspace-badges">
            <span className="workspace-badge">{threadLoadingId ? "Loading thread…" : panelMeta}</span>
            {meetingSession.streaming && <span className="workspace-badge workspace-badge-live">Meeting stream live</span>}
          </div>
        </header>

        <div className="border-b border-[#2a2d2e] px-4 py-4">
          <PromptInput
            onSubmit={handleSubmit}
            loading={loading}
            fillPrompt={fillPrompt}
            onFillPromptConsumed={() => setFillPrompt("")}
          />
          {error && (
            <div className="mt-3 rounded-xl border border-red-700/40 bg-red-900/20 px-5 py-3 text-sm text-red-300">
              <strong>Error:</strong> {error}
              <p className="mt-1 text-xs text-red-400/80">
                Make sure Ollama is running: <code className="font-mono">ollama serve</code>
              </p>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col">
            {!workspace && !loading && <EmptyWorkspace />}
            {loading && !workspace && (
              <div className="p-6">
                <div className="workspace-card animate-pulse">
                  <div className="mb-3 h-4 w-1/3 rounded bg-[#2d2d30]" />
                  <div className="space-y-2">
                    <div className="h-3 rounded bg-[#2d2d30]" />
                    <div className="h-3 w-4/5 rounded bg-[#2d2d30]" />
                    <div className="h-3 w-3/5 rounded bg-[#2d2d30]" />
                  </div>
                </div>
              </div>
            )}
            {workspace && (
              <div
                ref={splitWorkspaceRef}
                className="split-workspace"
              >
                <div
                  className="split-pane min-h-0 overflow-auto"
                  style={{
                    width: bottomPanelOpen ? `${Math.round(sqlPaneRatio * 100)}%` : "100%",
                  }}
                >
                  <div className="editor-tab-strip">
                    <button type="button" className="editor-tab active">
                      query.sql
                    </button>
                  </div>
                  <div className="space-y-4 p-4">
                    <div className="workspace-card workspace-card-compact">
                      <PanelHeader
                        title={workspace.title}
                        meta={workspace.prompt || "No prompt available"}
                        actions={
                          <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                            <span>{workspace.dialect}</span>
                            {workspace.source === "history" && (
                              <span className="rounded border border-[#2a2d2e] px-2 py-1 text-[#c5c5c5]">hydrated from thread</span>
                            )}
                          </div>
                        }
                      />
                      {workspace.shortExplanation && (
                        <p className="text-sm leading-relaxed text-[#c5c5c5]">{workspace.shortExplanation}</p>
                      )}
                    </div>

                    <div className="workspace-card !p-0">
                      <SqlTab
                        sql={workspace.sql}
                        optimizedSql={workspace.optimizedSql}
                        dialect={workspace.dialect}
                        prompt={workspace.prompt}
                        onSaved={refreshLibrary}
                      />
                    </div>
                  </div>
                </div>

                {bottomPanelOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Resize SQL and meeting panels"
                      className={`splitter-handle ${draggingSplit ? "active" : ""}`}
                      onMouseDown={() => setDraggingSplit(true)}
                    >
                      <span className="splitter-grip" />
                    </button>

                    <div className="split-pane flex-1 min-h-0 overflow-auto border-l border-[#2a2d2e] bg-[#181818]">
                      <div className="editor-tab-strip border-b border-[#2a2d2e]">
                        <button type="button" className="editor-tab active">
                          Meeting
                          {(meetingSession.streaming || meetingSession.messages.length > 0) && (
                            <span className="ml-2 rounded-full bg-[#007acc] px-1.5 py-0.5 text-[10px] text-white">
                              {meetingSession.streaming ? "live" : meetingSession.messages.length}
                            </span>
                          )}
                        </button>
                      </div>
                      <div className="min-h-0 p-4">
                        <MeetingChat
                          threadId={workspace.threadId ?? `ephemeral-${workspace.title}`}
                          turnId={workspace.turnId}
                          sql={workspace.sql}
                          plan={activePlan}
                          session={meetingSession}
                          setSession={setMeetingSession}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          {rightPanelOpen && (
            <aside className="inspector-panel">
              <div className="editor-tab-strip border-b border-[#2a2d2e]">
                <button
                  type="button"
                  onClick={() => setInspectorView("plan")}
                  className={`editor-tab ${inspectorView === "plan" ? "active" : ""}`}
                >
                  Plan
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorView("validation")}
                  className={`editor-tab ${inspectorView === "validation" ? "active" : ""}`}
                >
                  Validation
                  {validationCount > 0 && (
                    <span className="ml-2 rounded-full bg-[#f0ad4e] px-1.5 py-0.5 text-[10px] text-black">{validationCount}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorView("why")}
                  className={`editor-tab ${inspectorView === "why" ? "active" : ""}`}
                >
                  Why
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorView("builder")}
                  className={`editor-tab ${inspectorView === "builder" ? "active" : ""}`}
                >
                  Builder
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorView("review")}
                  className={`editor-tab ${inspectorView === "review" ? "active" : ""}`}
                >
                  Review
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
                <div className="workspace-card workspace-card-compact">
                  <PanelHeader title="Meeting sync" meta="Shared state visible outside the chat panel" />
                  <div className="space-y-3 text-sm text-[#c5c5c5]">
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${meetingSession.streaming ? "bg-[#04395e] text-[#9cdcfe]" : "bg-[#252526] text-[#8b949e]"}`}>
                        {meetingSession.streaming ? "Responding" : meetingSession.mode === "assumptions" ? "Waiting on assumption check" : "Idle"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Confirmed</span>
                      <span>{confirmedCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Flagged</span>
                      <span>{flaggedCount}</span>
                    </div>
                    <div className="rounded-lg border border-[#2a2d2e] bg-[#1e1e1e] p-3 text-xs text-[#8b949e]">
                      {meetingSession.messages[meetingSession.messages.length - 1]?.content || "No meeting transcript yet."}
                    </div>
                  </div>
                </div>

                {workspace ? (
                  <>
                    {inspectorView === "plan" && (
                      <div className="workspace-card">
                        {workspace.plan ? (
                          <PlanTab plan={workspace.plan} />
                        ) : (
                          <p className="text-sm text-[#8b949e]">
                            This thread predates the planner payload, so only the latest SQL and transcript were restored.
                          </p>
                        )}
                      </div>
                    )}

                    {inspectorView === "validation" && (
                      <div className="workspace-card">
                        {workspace.validation ? (
                          <ValidationTab validation={workspace.validation} />
                        ) : (
                          <p className="text-sm text-[#8b949e]">
                            Validation details are available for newly generated queries. Re-run from the prompt to restore parser warnings and confidence.
                          </p>
                        )}
                      </div>
                    )}

                    {inspectorView === "why" && (
                      <div className="workspace-card">
                        <WhyTab
                          shortExplanation={workspace.shortExplanation}
                          sql={workspace.sql}
                          plan={activePlan}
                        />
                      </div>
                    )}

                    {inspectorView === "builder" && (
                      <div className="workspace-card">
                        {workspace.threadId && workspace.plan ? (
                          <QueryCardBuilder
                            plan={workspace.plan}
                            dialect={workspace.dialect}
                            threadId={workspace.threadId}
                            onNewSql={(sql) => {
                              setWorkspace((prev) => (prev ? { ...prev, sql } : prev));
                            }}
                          />
                        ) : (
                          <p className="text-sm text-[#8b949e]">
                            Card Builder needs a live generated plan. Regenerate this query from the prompt to enable it.
                          </p>
                        )}
                      </div>
                    )}

                    {inspectorView === "review" && (
                      <div className="workspace-card">
                        <ReviewTab initialSql={workspace.sql} dialect={workspace.dialect} />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="workspace-card">
                    <p className="text-sm text-[#8b949e]">The inspector will populate when a query is active.</p>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>

        <footer className="status-bar">
          <span>{workspace?.dialect ?? "postgresql"}</span>
          <span>{workspace?.threadId ? `thread ${workspace.threadId.slice(0, 8)}` : "scratchpad"}</span>
          <span>{meetingSession.streaming ? "meeting stream active" : "ready"}</span>
          <span>{workspace?.validation?.confidence ? `${workspace.validation.confidence} confidence` : "local-only workspace"}</span>
        </footer>
      </main>
    </div>
  );
}
