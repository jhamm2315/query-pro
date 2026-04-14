/**
 * Typed API client for the Query Pro backend.
 * The Vite dev proxy forwards /api/* to http://localhost:8000.
 */

import type {
  Dialect,
  GenerateResponse,
  QueryBank,
  ReviewResult,
  SavedQuery,
  ThreadDetail,
  ThreadSummary,
  ValidateResponse,
} from "../types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// SQL endpoints
// ---------------------------------------------------------------------------

export interface GenerateRequest {
  prompt: string;
  dialect: Dialect;
  thread_id?: string;
  include_optimized?: boolean;
}

export const sqlApi = {
  generate: (body: GenerateRequest) =>
    request<GenerateResponse>("/sql/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  plan: (prompt: string, dialect: Dialect) =>
    request("/sql/plan", {
      method: "POST",
      body: JSON.stringify({ prompt, dialect }),
    }),

  validate: (sql: string, dialect: Dialect) =>
    request<ValidateResponse>("/sql/validate", {
      method: "POST",
      body: JSON.stringify({ sql, dialect }),
    }),

  /** Lazy — call when the "Why it works" tab first opens. */
  fetchExplanation: (sql: string, plan: import("../types").PlannerOutput) =>
    request<{ explanation: string }>("/sql/explain", {
      method: "POST",
      body: JSON.stringify({ sql, plan }),
    }),

  /** Lazy — call when the "Meeting Mode" tab first opens. */
  fetchMeetingSummary: (sql: string, plan: import("../types").PlannerOutput) =>
    request<{ meeting_mode: string }>("/sql/meeting-summary", {
      method: "POST",
      body: JSON.stringify({ sql, plan }),
    }),
};

// ---------------------------------------------------------------------------
// History endpoints
// ---------------------------------------------------------------------------

export const historyApi = {
  listThreads: () => request<ThreadSummary[]>("/history/threads"),

  getThread: (threadId: string) =>
    request<ThreadDetail>(`/history/threads/${threadId}`),

  createThread: (title?: string, dialect: Dialect = "postgresql") =>
    request<ThreadDetail>("/history/threads", {
      method: "POST",
      body: JSON.stringify({ title, dialect }),
    }),
};

// ---------------------------------------------------------------------------
// Voice endpoint
// ---------------------------------------------------------------------------

export const voiceApi = {
  transcribe: (audioB64: string, language = "en", backend = "stub") =>
    request<{ transcript: string; backend_used: string; confidence: number | null }>("/voice/transcribe", {
      method: "POST",
      body: JSON.stringify({ audio_b64: audioB64, language, backend }),
    }),
};

// ---------------------------------------------------------------------------
// Meeting chat (SSE streaming)
// ---------------------------------------------------------------------------

export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface MeetingChatPayload {
  thread_id: string;
  messages: ChatMessage[];
  sql?: string;
  grain?: string;
  patterns?: string[];
  assumptions?: string[];
  ambiguities?: string[];
  confirmed_assumptions?: string[];
  mode?: "assumptions" | "chat";
}

export type SseChunk =
  | { type: "token";           text: string }
  | { type: "assumption";      text: string; confirmed: string[] }
  | { type: "assumption_done"; text: string; confirmed: string[] }
  | { type: "done";            confirmed: string[]; mode: "assumptions" | "chat" };

/** Stream meeting chat SSE chunks via an async generator. */
export async function* streamMeetingChat(
  payload: MeetingChatPayload
): AsyncGenerator<SseChunk> {
  const res = await fetch("/api/chat/meeting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) throw new Error(`Chat stream error: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          yield JSON.parse(line.slice(6)) as SseChunk;
        } catch { /* skip malformed */ }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// SQL review / correction
// ---------------------------------------------------------------------------

export const reviewApi = {
  review: (sql: string, dialect: Dialect) =>
    request<ReviewResult>("/sql/review", {
      method: "POST",
      body: JSON.stringify({ sql, dialect }),
    }),
};

// ---------------------------------------------------------------------------
// Query bank (pre-built templates)
// ---------------------------------------------------------------------------

export const bankApi = {
  getBank: () => request<QueryBank>("/library/bank"),
};

// ---------------------------------------------------------------------------
// Saved-query library
// ---------------------------------------------------------------------------

export const libraryApi = {
  list: () => request<SavedQuery[]>("/library"),

  save: (body: { label: string; sql: string; prompt: string; dialect: Dialect }) =>
    request<SavedQuery>("/library", { method: "POST", body: JSON.stringify(body) }),

  remove: (id: string) =>
    fetch(`${BASE}/library/${id}`, { method: "DELETE" }).then(() => undefined),
};

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const healthApi = {
  check: () => fetch("/health").then((r) => r.json()),
};
