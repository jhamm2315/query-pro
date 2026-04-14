import { useState, useRef, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";
import type { MeetingSessionState, PlannerOutput } from "../types";
import {
  streamMeetingChat,
  type ChatMessage,
  type MeetingChatPayload,
} from "../lib/api";
import { MicButton } from "./MicButton";

const BASE = "/api";

interface Props {
  threadId: string;
  turnId?: string;   // if provided, confirmed assumptions are persisted on completion
  sql: string;
  plan: PlannerOutput;
  session: MeetingSessionState;
  setSession: Dispatch<SetStateAction<MeetingSessionState>>;
}
let _msgId = 0;
export const nextMeetingMessageId = () => String(++_msgId);

export function createMeetingSessionState(
  plan: PlannerOutput,
  initialMeetingMode = "",
  confirmedAssumptions: string[] = []
): MeetingSessionState {
  const messages = [];

  if (initialMeetingMode) {
    messages.push({
      id: nextMeetingMessageId(),
      role: "assistant" as const,
      content: initialMeetingMode,
    });
  }

  messages.push({
    id: nextMeetingMessageId(),
    role: "assistant" as const,
    content:
      plan.assumptions.length > 0
        ? `Let's confirm **${plan.assumptions.length} assumption${plan.assumptions.length > 1 ? "s" : ""}** before going deeper.\n\n` +
          `**Assumption 1/${plan.assumptions.length}:** ${plan.assumptions[0]}\n\nIs this correct? Reply **Y** to confirm or **N** to flag it.`
        : "No assumptions to confirm. Ask me anything about this query.",
  });

  return {
    messages,
    mode: plan.assumptions.length > 0 ? "assumptions" : "chat",
    confirmedAssumptions,
    streaming: false,
  };
}

export function MeetingChat({ threadId, turnId, sql, plan, session, setSession }: Props) {
  const [input, setInput] = useState("");
  const bottomRef                             = useRef<HTMLDivElement>(null);
  const inputRef                              = useRef<HTMLInputElement>(null);
  const { messages, streaming, mode, confirmedAssumptions } = session;

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (userText: string) => {
      if (!userText.trim() || streaming) return;

      const userMsg = { id: nextMeetingMessageId(), role: "user" as const, content: userText };
      const streamingId = nextMeetingMessageId();

      setSession((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          userMsg,
          { id: streamingId, role: "assistant", content: "", isStreaming: true },
        ],
        streaming: true,
      }));
      setInput("");

      // Build payload for the API
      const historyForApi: ChatMessage[] = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userText },
      ];

      const payload: MeetingChatPayload = {
        thread_id: threadId,
        messages: historyForApi,
        sql,
        grain: plan.grain,
        patterns: plan.patterns,
        assumptions: plan.assumptions,
        ambiguities: plan.ambiguities,
        confirmed_assumptions: confirmedAssumptions,
        mode,
      };

      let accumulated = "";
      let nextMode = mode;
      let nextConfirmed = [...confirmedAssumptions];

      try {
        for await (const chunk of streamMeetingChat(payload)) {
          if (chunk.type === "token") {
            accumulated += chunk.text;
            setSession((prev) => ({
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === streamingId
                  ? { ...m, content: accumulated, isStreaming: true }
                  : m
              ),
            }));
          } else if (chunk.type === "assumption" || chunk.type === "assumption_done") {
            nextConfirmed = chunk.confirmed;
            if (chunk.text) {
              accumulated = chunk.text;
              setSession((prev) => ({
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === streamingId
                    ? { ...m, content: chunk.text, isStreaming: false }
                    : m
                ),
                confirmedAssumptions: chunk.confirmed,
              }));
            } else {
              setSession((prev) => ({
                ...prev,
                confirmedAssumptions: chunk.confirmed,
              }));
            }
          } else if (chunk.type === "done") {
            nextMode = chunk.mode;
            nextConfirmed = chunk.confirmed;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        setSession((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === streamingId
              ? { ...m, content: `Error: ${msg}`, isStreaming: false }
              : m
          ),
          streaming: false,
        }));
      }

      setSession((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === streamingId ? { ...m, isStreaming: false } : m
        ),
        mode: nextMode,
        confirmedAssumptions: nextConfirmed,
        streaming: false,
      }));

      // Persist confirmed assumptions when assumptions phase completes
      if (nextMode === "chat" && mode === "assumptions" && turnId && nextConfirmed.length > 0) {
        fetch(`${BASE}/history/turns/${turnId}/assumptions`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmed: nextConfirmed }),
        }).catch(() => {}); // fire-and-forget
      }

      inputRef.current?.focus();
    },
    [streaming, messages, threadId, sql, plan, confirmedAssumptions, mode, setSession]
  );

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const quickReply = (text: string) => send(text);

  const confirmedCount = confirmedAssumptions.filter(
    (a) => !a.startsWith("[FLAGGED]")
  ).length;
  const totalAssumptions = plan.assumptions.length;

  return (
    <div className="flex flex-col h-[520px]">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 bg-gray-900/50 rounded-t-lg shrink-0">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${mode === "assumptions" ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
          <span className="text-xs font-medium text-gray-300">
            {mode === "assumptions" ? "Confirming assumptions" : "Deep dive mode"}
          </span>
        </div>
        {totalAssumptions > 0 && (
          <span className="text-xs text-gray-500">
            {confirmedCount}/{totalAssumptions} confirmed
          </span>
        )}
        <div className="ml-auto flex gap-1">
          {confirmedAssumptions.filter((a) => !a.startsWith("[FLAGGED]")).map((_, i) => (
            <span key={i} className="badge badge-high text-[10px] px-1.5 py-0.5">✓</span>
          ))}
          {confirmedAssumptions.filter((a) => a.startsWith("[FLAGGED]")).map((_, i) => (
            <span key={i} className="badge badge-medium text-[10px] px-1.5 py-0.5">⚠</span>
          ))}
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`
                max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
                ${msg.role === "user"
                  ? "bg-brand-700 text-white rounded-br-sm"
                  : "bg-gray-800 text-gray-200 rounded-bl-sm"
                }
              `}
            >
              <MarkdownText text={msg.content} />
              {msg.isStreaming && (
                <span className="inline-block w-1.5 h-3.5 bg-gray-400 animate-pulse rounded-sm ml-0.5 align-middle" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick Y/N buttons (only during assumption phase) */}
      {mode === "assumptions" && !streaming && (
        <div className="flex gap-2 px-4 py-2 border-t border-gray-800 bg-gray-900/30 shrink-0">
          <button
            onClick={() => quickReply("Y")}
            className="flex-1 py-2 rounded-lg bg-green-800 hover:bg-green-700 text-green-100 text-sm font-semibold transition-colors"
          >
            Y — Confirmed
          </button>
          <button
            onClick={() => quickReply("N")}
            className="flex-1 py-2 rounded-lg bg-red-900 hover:bg-red-800 text-red-100 text-sm font-semibold transition-colors"
          >
            N — Flag it
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-800 shrink-0">
        <MicButton
          onTranscript={(text) => {
            setInput((prev) => (prev ? prev + " " + text : text));
            inputRef.current?.focus();
          }}
          disabled={streaming}
        />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={
            mode === "assumptions"
              ? "Y / N, speak, or type…"
              : "Speak or type a question…"
          }
          disabled={streaming}
          className="
            flex-1 bg-gray-800 text-gray-100 placeholder-gray-500 text-sm
            rounded-xl px-4 py-2 border border-gray-700
            focus:outline-none focus:border-brand-500 transition-colors
            disabled:opacity-50
          "
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || streaming}
          className="
            p-2.5 rounded-xl bg-brand-600 hover:bg-brand-500
            text-white transition-colors disabled:opacity-40
          "
        >
          {streaming ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Inline markdown renderer (bold + newlines only) ──────────────────────────

function MarkdownText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return (
          <span key={i}>
            {part.split("\n").map((line, j) => (
              <span key={j}>
                {line}
                {j < part.split("\n").length - 1 && <br />}
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
}
