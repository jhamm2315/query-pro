# Query Pro — Architecture

## Overview

Query Pro is a **local-first, privacy-first** SQL workspace.
All LLM inference, data persistence, and processing runs on the user's machine.
No network calls to external APIs. No telemetry.

---

## Component Map

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (localhost:5173)                                        │
│                                                                  │
│  ┌──────────┐  ┌────────────────────────────────────────────┐   │
│  │ Sidebar  │  │  PromptInput                               │   │
│  │ Threads  │  │  SchemaUpload · DialectSelector · MicButton│   │
│  │ Saved    │  └────────────────────────────────────────────┘   │
│  │ Templates│  ┌────────────────────────────────────────────┐   │
│  └──────────┘  │  Split workspace                           │   │
│                │  ┌──────────────────┐ ┌──────────────────┐ │   │
│                │  │  SQL pane        │ │  Meeting pane    │ │   │
│                │  │  query.sql tab   │ │  Assumption Y/N  │ │   │
│                │  │  .md export      │ │  Open chat (SSE) │ │   │
│                │  └──────────────────┘ └──────────────────┘ │   │
│                └────────────────────────────────────────────┘   │
│                ┌────────────────────────────────────────────┐   │
│                │  Inspector panel (right)                    │   │
│                │  Plan · Validation · Why · Builder         │   │
│                │  Review · Execute (DuckDB)                  │   │
│                └────────────────────────────────────────────┘   │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTP / SSE (proxied by Vite)
┌───────────────────────────────▼──────────────────────────────────┐
│  FastAPI (localhost:8000)                                        │
│                                                                  │
│  POST /api/sql/generate  (single-shot JSON)                      │
│  POST /api/sql/stream    (SSE token stream)                      │
│    │                                                             │
│    ├─ PromptCleaner           (normalise text)                   │
│    ├─ plan_and_generate()     (one LLM call → plan + SQL)        │
│    │    ├─ injects {{HISTORY}} (last 4 turns from thread)        │
│    │    └─ injects {{SCHEMA}}  (user-pasted DDL / CSV headers)   │
│    ├─ ValidatorService        (SQLGlot + heuristics)             │
│    └─ HistoryService          (SQLite write)                     │
│                                                                  │
│  POST /api/sql/execute   (DuckDB sandbox)                        │
│  POST /api/sql/explain   (lazy — Why tab)                        │
│  POST /api/sql/meeting-summary (lazy — Meeting tab)              │
│  POST /api/sql/review    (bug-fix + optimise)                    │
│  POST /api/chat/meeting  (SSE — meeting mode chat)               │
│  POST /api/voice/transcribe  (user-invoked only)                 │
│  GET  /api/history/threads                                       │
│  GET  /health            (Ollama status + voice_backends list)   │
└───────────────────────────────┬──────────────────────────────────┘
                                │
          ┌─────────────────────┼──────────────────────┐
          ▼                     ▼                      ▼
     ┌─────────┐         ┌───────────┐          ┌──────────┐
     │ Ollama  │         │  SQLite   │          │ DuckDB   │
     │ (LLM)  │         │ (history) │          │ (sandbox)│
     └─────────┘         └───────────┘          └──────────┘
                                                      ▲
                                               ┌──────────┐
                                               │ SQLGlot  │
                                               │ (parser) │
                                               └──────────┘
```

Also deployable as a VS Code extension (`apps/vscode/`) — opens the web app in a side panel with Insert SQL and Generate from Selection commands.

---

## Data Flow: POST /api/sql/stream  (and /generate)

```
User prompt  +  optional schema_context  +  active thread_id
    │
    ▼
PromptCleaner.clean_prompt()
    │  Removes filler words, normalises whitespace
    ▼
HistoryService.get_thread()          ← skipped if no thread_id
    │  Fetches last 4 turns (prompt + sql) as conversation context
    ▼
plan_and_generate()
    │  Builds prompt from plan_and_generate_prompt.txt
    │    {{DIALECT}}  — target SQL dialect
    │    {{SCHEMA}}   — user-pasted DDL or CSV headers (if any)
    │    {{HISTORY}}  — prior turn summaries (if thread active)
    │    {{CLEANED_PROMPT}} — the normalised question
    │
    │  /stream: streams tokens via ollama.stream_generate()
    │            yields {type:"token", text} SSE events live
    │  /generate: single ollama.generate() call, returns full text
    │
    │  Extracts PLAN JSON  → PlannerOutput
    │  Extracts SQL        → primary_sql
    ▼
short_explain(plan)
    │  Instant, no LLM — derives 2–3 sentences from PlannerOutput fields
    ▼
ValidatorService.validate_sql()
    │  Pass 1: SQLGlot structural parse
    │  Pass 2: heuristic checks
    │  Returns ValidateResponse (warnings + confidence)
    ▼
HistoryService.save_turn()
    │  Auto-creates thread if thread_id is new
    │  Writes turn (prompt, sql, explanation, dialect, confidence)
    ▼
/stream: {type:"done", sql, plan, validation, thread_id, turn_id, short_explanation}
/generate: GenerateResponse (JSON)
    ▼
Frontend workspace updates
    Explanation and meeting summary loaded lazily (on tab open)
```

---

## Merged Plan + Generate

The original architecture used two separate LLM calls (planner → generator). The current implementation merges them into a single call using `plan_and_generate_prompt.txt`, which instructs the model to return:

```
PLAN:
{ ... structured JSON ... }

SQL:
<sql>
...
</sql>
```

This saves one full inference round-trip (~10–20 s on CPU, ~2–4 s on GPU).

**Extraction logic** (in `services/plan_and_generate.py`):

1. Pull JSON after `PLAN:` and before `SQL:` → `PlannerOutput`
2. Pull SQL from `<sql>…</sql>` tags → fallback to ` ``` ` fences → fallback to `SQL:` marker

---

## Streaming Architecture

`POST /api/sql/stream` returns `text/event-stream`. Event types:

| Event type | Payload | When |
|------------|---------|------|
| `token` | `{text: "..."}` | Each LLM token as it arrives |
| `done` | `{sql, plan, validation, thread_id, turn_id, short_explanation, dialect}` | After full text is buffered and parsed |
| `error` | `{message: "..."}` | On Ollama failure |

The frontend `streamGenerate()` async generator in `lib/api.ts` consumes these events. `useGenerate.ts` accumulates `streamingTokens` for the live preview and resolves the final `GenerateResponse` from the `done` event.

Meeting mode chat (`POST /api/chat/meeting`) also uses SSE with its own event types: `token`, `assumption`, `assumption_done`, `done`.

---

## Multi-turn Conversation Context

When a `thread_id` is present on a generate request, the last 4 turns are fetched from SQLite and formatted as:

```
Previous question: <turn N-3 prompt>
Previous SQL: <turn N-3 sql>
Previous question: <turn N-2 prompt>
Previous SQL: <turn N-2 sql>
...
```

This block is injected as `{{HISTORY}}` in the prompt template. The model can reference prior queries in follow-up questions (e.g. "now add a filter for region = 'EU'") without the frontend needing to manage prompt state.

---

## Schema Context

When the user pastes DDL or CSV headers in the Schema upload panel, the text is sent as `schema_context` in the request body and injected as `{{SCHEMA}}` in the prompt template.

Example injection:

```
Schema:
CREATE TABLE orders (id INT, customer_id INT, total DECIMAL, created_at TIMESTAMP);
CREATE TABLE customers (id INT, name TEXT, region TEXT);

Question: Find total spend per customer in the last 30 days
```

The model uses this to resolve table names and column types without guessing.

---

## Planner Schema

The planner output is the structured intermediate representation passed to the SQL generator, explainer, and meeting mode.

```json
{
  "user_prompt":         "original text",
  "cleaned_prompt":      "normalised text",
  "dialect":             "postgresql",
  "query_type":          "SELECT",
  "grain":               "one row per vendor (latest invoice)",
  "tables":              ["invoices", "vendors"],
  "join_keys":           ["vendor_id"],
  "joins":               ["invoices INNER JOIN vendors ON invoices.vendor_id = vendors.id"],
  "filters":             ["total_spend > 10000"],
  "aggregations":        ["SUM(total) AS total_spend"],
  "window_functions":    ["ROW_NUMBER() OVER (PARTITION BY vendor_id ORDER BY invoice_date DESC)"],
  "group_by":            ["vendor_id", "month"],
  "order_by":            ["monthly_rank ASC"],
  "patterns":            ["latest-row", "ranking", "grouped-aggregation"],
  "output_columns":      ["vendor_id", "month", "total_spend", "monthly_rank"],
  "assumptions":         ["table is named invoices"],
  "ambiguities":         ["fiscal vs calendar month not specified"],
  "verification_checks": ["row count = distinct vendor count"],
  "optimization_notes":  ["composite index on (vendor_id, invoice_date)"],
  "confidence_rationale": "pattern is clear; table name assumed"
}
```

---

## Validator Design

The validator runs two passes:

**Pass 1 — Structural parse (SQLGlot)**
- Attempts to parse the SQL in the target dialect
- On parse error → severity=error, confidence=low

**Pass 2 — Heuristic checks**

| Check | Code | How detected |
|-------|------|-------------|
| Cartesian join | `CARTESIAN_JOIN` | JOIN count > ON count |
| WHERE/HAVING misuse | `WHERE_HAVING_MISUSE` | aggregate fn in WHERE block |
| Grain ambiguity | `GRAIN_AMBIGUITY` | JOIN but no GROUP BY or window fn |
| Duplicate inflation | `DUPLICATE_INFLATION` | JOIN without DISTINCT/GROUP/window |
| SELECT * | `SELECT_STAR` | regex on SELECT clause |

**Confidence rules:**

| Condition | Level |
|-----------|-------|
| Any error | low |
| ≥ 1 warning | medium |
| 0 warnings | high |

---

## DuckDB Execution Sandbox

`POST /api/sql/execute` runs the submitted SQL in a fresh in-memory DuckDB connection. Each call is fully isolated — no state persists between runs.

**Safety model:**
- Blocked statement types: `ATTACH`, `DETACH`, `COPY … TO`, `INSTALL`, `LOAD`, `PRAGMA`, `SET FILE`, `EXPORT`
- Maximum 10 000 rows returned
- 30-second execution timeout (enforced via `asyncio.wait_for`)
- Runs in a thread pool executor to avoid blocking the async event loop

The `ExecuteTab` in the inspector renders results as a scrollable table with sticky column headers. NULL values are displayed as `NULL` in muted text.

---

## Voice Architecture

Voice is **user-invoked only** — no passive capture at any point.

### Frontend strategy (in order of preference)

1. **Web Speech API** — available in Chrome and Edge; zero round-trips, instant feedback
2. **Whisper backend** — `MicButton` probes `GET /health` on mount; if `voice_backends` includes `"whisper"`, it uses `MediaRecorder` to capture audio and sends the base64-encoded blob to `POST /api/voice/transcribe`
3. **No-op** — shows an informational alert if neither is available

### Backend protocol

```python
class TranscriptionBackend(Protocol):
    async def transcribe(self, audio_path: Path, language: str) -> tuple[str, float | None]: ...
```

| Backend | Key | Notes |
|---------|-----|-------|
| `StubBackend` | `stub` | Default; returns placeholder text |
| `WhisperBackend` | `whisper` | Auto-registered if `openai-whisper` is installed |

`WhisperBackend` loads the model at startup (`WHISPER_MODEL` env var, default `base`) and runs inference in a thread pool executor.

To add a new backend: implement the protocol, register it in `BACKENDS` in `services/voice.py`.

---

## VS Code Extension

`apps/vscode/` is a standard VS Code extension. It contributes:

| Command | Description |
|---------|-------------|
| `queryPro.open` | Opens a `WebviewPanel` beside the active editor |
| `queryPro.generateFromSelection` | Prefills the prompt with the current text selection |

The webview embeds the Vite dev server in an `<iframe>`. A thin `postMessage` bridge handles two directions:

- **Extension → webview**: `{type: "prefill", prompt}` to pre-populate the prompt input
- **Webview → extension**: `{type: "querypro:sql", sql}` to expose the last generated SQL; the **Insert SQL** toolbar button posts this to the VS Code host which inserts it at the cursor

---

## Persistence

SQLite via SQLAlchemy ORM. Three tables:

```sql
CREATE TABLE threads (
    thread_id  TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    dialect    TEXT NOT NULL,
    category   TEXT NOT NULL DEFAULT 'General',
    created_at DATETIME,
    updated_at DATETIME
);

CREATE TABLE turns (
    turn_id               TEXT PRIMARY KEY,
    thread_id             TEXT REFERENCES threads(thread_id),
    prompt                TEXT NOT NULL,
    sql                   TEXT NOT NULL,
    explanation           TEXT NOT NULL,
    meeting_mode          TEXT NOT NULL,
    dialect               TEXT NOT NULL,
    confidence            TEXT NOT NULL,
    confirmed_assumptions TEXT NOT NULL DEFAULT '[]',  -- JSON array
    created_at            DATETIME
);

CREATE TABLE saved_queries (
    id         TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    sql        TEXT NOT NULL,
    prompt     TEXT NOT NULL DEFAULT '',
    dialect    TEXT NOT NULL DEFAULT 'postgresql',
    created_at DATETIME
);
```

---

## Prompt File Versioning

Prompts live in `packages/prompt-templates/` as plain `.txt` files.
Template variables use `{{VARIABLE_NAME}}` syntax substituted at runtime.

| File | Variables | Purpose |
|------|-----------|---------|
| `plan_and_generate_prompt.txt` | `{{DIALECT}}` `{{SCHEMA}}` `{{HISTORY}}` `{{CLEANED_PROMPT}}` | Combined planner + SQL generator (single LLM call) |
| `explainer_prompt.txt` | `{{SQL}}` `{{PLAN}}` | Full plain-English walk-through |
| `sql_review_prompt.txt` | `{{SQL}}` `{{DIALECT}}` | Bug-fix and optimisation |
| `meeting_chat_prompt.txt` | `{{SQL}}` `{{GRAIN}}` `{{PATTERNS}}` `{{CONFIRMED}}` `{{HISTORY}}` | Open meeting-mode chat |
| `meeting_summary_after_assumptions_prompt.txt` | `{{SQL}}` `{{GRAIN}}` `{{PATTERNS}}` `{{CONFIRMED}}` `{{FLAGGED}}` | Auto-summary after assumption loop completes |

---

## Export

Markdown export is handled entirely client-side in `SqlTab.tsx`. No server call is made.

The exported `.md` file contains:
- The original prompt
- The dialect
- The SQL in a fenced code block

---

## Roadmap

### Shipped

- [x] Merged plan + SQL generation (single LLM call)
- [x] Streaming SQL generation (SSE)
- [x] Multi-turn conversation context (last 4 turns injected)
- [x] Schema upload (DDL / CSV headers → `{{SCHEMA}}`)
- [x] Whisper voice backend (auto-registered)
- [x] DuckDB execution sandbox
- [x] Export to Markdown
- [x] VS Code extension

### Next

- [ ] DiffMode: compare two generated SQL variants side by side
- [ ] Notion export (requires user-provided integration token)
- [ ] Plugin system for custom validators
- [ ] Schema inference from live database connection
