# SQL Copilot Local — Architecture

## Overview

SQL Copilot Local is a **local-first, privacy-first** tool.
All LLM inference, data persistence, and processing runs on the user's machine.
No network calls to external APIs. No telemetry.

---

## Component Map

```
┌─────────────────────────────────────────────────────┐
│  Browser (localhost:5173)                           │
│  ┌──────────┐  ┌──────────────────────────────┐    │
│  │ Sidebar  │  │  PromptInput                 │    │
│  │ (threads)│  │  DialectSelector · MicButton │    │
│  └──────────┘  └──────────────────────────────┘    │
│                ┌──────────────────────────────┐    │
│                │  ResultTabs                  │    │
│                │  Plan · SQL · Why · Validate │    │
│                │  Meeting mode                │    │
│                └──────────────────────────────┘    │
└────────────────────────┬────────────────────────────┘
                         │ HTTP (proxied by Vite dev server)
┌────────────────────────▼────────────────────────────┐
│  FastAPI (localhost:8000)                           │
│                                                     │
│  POST /api/sql/generate                             │
│    │                                                │
│    ├─ PromptCleaner          (normalise text)       │
│    ├─ PlannerService         (LLM → JSON plan)      │
│    ├─ SqlGeneratorService    (LLM → SQL)            │
│    ├─ ExplainerService       (LLM → explanation)    │
│    ├─ ValidatorService       (SQLGlot + heuristics) │
│    ├─ MeetingSummaryService  (LLM → verbal summary) │
│    └─ HistoryService         (SQLite write)         │
│                                                     │
│  GET /api/history/threads                           │
│    └─ HistoryService         (SQLite read)          │
│                                                     │
│  POST /api/voice/transcribe                         │
│    └─ VoiceService           (pluggable backend)    │
└────────────────────────┬────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌─────────┐   ┌───────────┐   ┌──────────┐
    │ Ollama  │   │  SQLite   │   │ SQLGlot  │
    │ (LLM)  │   │ (history) │   │ (parser) │
    └─────────┘   └───────────┘   └──────────┘
```

---

## Data Flow: POST /api/sql/generate

```
User prompt
    │
    ▼
PromptCleaner.clean_prompt()
    │  Removes filler words, normalises whitespace
    ▼
PlannerService.run_planner()
    │  Sends planner_prompt.txt to Ollama
    │  Returns PlannerOutput (structured JSON)
    ▼
SqlGeneratorService.generate_sql()
    │  Sends sql_generator_prompt.txt + plan to Ollama
    │  Returns primary SQL (+ optional optimized variant)
    ▼
ExplainerService.explain_sql()
    │  Sends explainer_prompt.txt + SQL + plan to Ollama
    │  Returns structured plain-English explanation
    ▼
ValidatorService.validate_sql()
    │  Parses SQL with SQLGlot
    │  Runs heuristic checks (Cartesian, grain, HAVING misuse …)
    │  Returns ValidateResponse with warnings + confidence
    ▼
MeetingSummaryService.generate_meeting_summary()
    │  Sends meeting_summary_prompt.txt to Ollama
    │  Returns 3–5 sentence verbal summary
    ▼
HistoryService.save_turn()
    │  Writes thread + turn to SQLite
    ▼
GenerateResponse (JSON) → Frontend
```

---

## Planner Schema

The planner is the heart of the pipeline. It decomposes the user's intent into a structured object before any SQL is written, ensuring the generator has full context.

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
| ≥ 2 warnings | medium |
| 1 warning | medium |
| 0 warnings | high |

---

## Voice Architecture

Voice is user-invoked only. The `VoiceService` defines a `TranscriptionBackend` protocol:

```python
class TranscriptionBackend(Protocol):
    async def transcribe(self, audio_path: Path, language: str) -> tuple[str, float | None]: ...
```

Current backends:
- `stub` — returns a placeholder string (default, development)
- `whisper` — plug in by creating `whisper_backend.py` and registering in `BACKENDS`
- `vosk` — plug in similarly

Frontend uses the Web Speech API for in-browser dictation (no audio sent to server unless the `/voice/transcribe` endpoint is explicitly called).

---

## Persistence

SQLite via SQLAlchemy ORM. Two tables:

```sql
CREATE TABLE threads (
    thread_id TEXT PRIMARY KEY,
    title     TEXT NOT NULL,
    dialect   TEXT NOT NULL,
    created_at DATETIME,
    updated_at DATETIME
);

CREATE TABLE turns (
    turn_id     TEXT PRIMARY KEY,
    thread_id   TEXT REFERENCES threads(thread_id),
    prompt      TEXT NOT NULL,
    sql         TEXT NOT NULL,
    explanation TEXT NOT NULL,
    meeting_mode TEXT NOT NULL,
    dialect     TEXT NOT NULL,
    confidence  TEXT NOT NULL,
    created_at  DATETIME
);
```

---

## Prompt File Versioning

Prompts live in `packages/prompt-templates/` as plain `.txt` files.
Template variables use `{{VARIABLE_NAME}}` syntax substituted at runtime.

| File | Purpose |
|------|---------|
| `planner_prompt.txt` | Decompose user intent into structured JSON |
| `sql_generator_prompt.txt` | Generate CTE-based SQL from the plan |
| `explainer_prompt.txt` | Write a plain-English walk-through |
| `validator_prompt.txt` | LLM-assisted validation (supplementary) |
| `meeting_summary_prompt.txt` | Produce a verbal summary |

---

## Roadmap

### Phase 2
- Streaming SQL generation (SSE / chunked response)
- Schema upload: paste DDL or CSV headers for grounded generation
- Whisper voice backend

### Phase 3
- Multi-turn conversation with plan context carried forward
- Query execution sandbox (DuckDB in-process)
- DiffMode: compare two generated SQL variants side by side

### Phase 4
- VS Code extension (sidebar panel)
- Export to Markdown / Notion
- Plugin system for custom validators
