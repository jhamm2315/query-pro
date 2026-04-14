# Query Pro

A local-first, privacy-first SQL workspace for analysts and engineers.

Converts typed prompts or voice transcripts into:
- A structured SQL **plan** (JSON)
- Dialect-specific **SQL** (PostgreSQL, T-SQL, MySQL, SQLite)
- A plain-English **explanation**
- **Validation** notes and confidence level
- A short **meeting-ready** verbal summary

Everything runs on your machine. No data leaves your environment.

---

## Features

| Feature | Status |
|---------|--------|
| Streaming SQL generation (SSE) | ✓ |
| Multi-turn conversation with context | ✓ |
| Whisper voice backend | ✓ |
| Schema upload (paste DDL / CSV headers) | ✓ |
| Query execution sandbox (DuckDB) | ✓ |
| Export to Markdown | ✓ |
| VS Code extension | ✓ |
| Meeting mode (assumption Y/N + open chat) | ✓ |
| Query review / correction | ✓ |
| Thread history (SQLite) | ✓ |
| Pre-built query bank | ✓ |

---

## Architecture

```
sql-copilot-local/
  apps/
    api/          FastAPI backend (Python)
    web/          React + Vite + Tailwind frontend
    vscode/       VS Code extension
  packages/
    shared-types/      TypeScript type definitions
    prompt-templates/  Versioned LLM prompt files
    query-bank/        Pre-built SQL templates
  docs/
```

See [docs/architecture.md](docs/architecture.md) for the full design.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | ≥ 3.11 | Backend runtime |
| Node.js | ≥ 20 | Frontend build |
| Ollama | latest | Local LLM runtime |
| DuckDB | auto-installed | Query execution sandbox |

### Install Ollama

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh
```

Pull a model (llama3.2 recommended for SQL tasks):
```bash
ollama pull llama3.2
```

---

## Setup

### Backend

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env if needed (Ollama URL, model, DB path)
```

### Frontend

```bash
cd apps/web
npm install
```

### VS Code extension (optional)

```bash
cd apps/vscode
npm install
npm run compile
```

Open VS Code, press `F5` to launch the Extension Development Host, then run the command **Query Pro: Open workspace** (`Ctrl+Shift+P` / `Cmd+Shift+P`).

---

## Running

### 1. Start Ollama

```bash
ollama serve
# In another terminal:
ollama run llama3.2
```

### 2. Start the API

```bash
cd apps/api
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

API is available at http://localhost:8000  
Swagger docs at http://localhost:8000/docs

### 3. Start the frontend

```bash
cd apps/web
npm run dev
```

UI is available at http://localhost:5173

---

## Running Tests

### Backend tests

```bash
cd apps/api
source .venv/bin/activate
pytest -v
```

Tests use an in-memory SQLite database and mock Ollama — no live model required.

### Frontend tests

```bash
cd apps/web
npm test
```

---

## Feature Guide

### Streaming SQL generation

SQL is now generated token-by-token via SSE. The workspace shows a live token stream while the model thinks; the inspector populates when the final `done` event arrives.

- Endpoint: `POST /api/sql/stream`
- Use `POST /api/sql/generate` for a single-shot (non-streaming) response.

### Multi-turn conversation context

When a thread is active, the last four turns (prompt + SQL pairs) are injected into the prompt automatically. The model can reference previous queries in follow-up questions without any extra configuration.

### Schema upload

Click **Schema context** above the prompt input to expand a DDL/CSV textarea. Paste `CREATE TABLE` statements or comma-separated column names. The schema is injected into the prompt so the model can resolve table names, join keys, and column types without guessing.

Example:
```sql
CREATE TABLE orders (id INT, customer_id INT, total DECIMAL, created_at TIMESTAMP);
CREATE TABLE customers (id INT, name TEXT, region TEXT);
```

### Voice input

- **Chrome / Edge** — uses the built-in Web Speech API. Click the mic icon to start/stop.
- **Whisper backend** — install `openai-whisper`, restart the API, and the mic button automatically switches to MediaRecorder + server-side transcription.

```bash
pip install openai-whisper
# Set model size (default: base):
export WHISPER_MODEL=small
```

Available backends are listed in `GET /health` under `voice_backends`.

### DuckDB execution sandbox

The **Execute** tab in the inspector runs the current SQL against an isolated in-memory DuckDB instance. Results appear in a scrollable table.

Limitations:
- No persistent tables — define data inline (CTEs, `CREATE TABLE AS SELECT …`).
- `ATTACH`, `COPY TO`, `INSTALL`, `LOAD` are blocked.
- Maximum 10 000 rows returned; 30-second timeout.

### Export to Markdown

Click the **.md** button in the SQL toolbar to download a Markdown file containing the prompt, dialect, and SQL code block.

### VS Code extension

| Command | Description |
|---------|-------------|
| `Query Pro: Open workspace` | Opens the Query Pro panel beside the current editor |
| `Query Pro: Generate SQL from selection` | Prefills the prompt with the selected text |

Right-click any selected text in an editor and choose **Query Pro: Generate SQL from selection** from the context menu.

Once SQL is generated, click **Insert SQL** in the panel toolbar to paste it at the cursor position.

**Settings:**

| Setting | Default | Description |
|---------|---------|-------------|
| `queryPro.apiUrl` | `http://localhost:8000` | Query Pro backend URL |
| `queryPro.defaultDialect` | `postgresql` | Default SQL dialect |

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check + Ollama status + voice backends |
| POST | `/api/sql/generate` | Full pipeline — plan → SQL → validate (single response) |
| POST | `/api/sql/stream` | Same pipeline, streamed as SSE tokens |
| POST | `/api/sql/explain` | Lazy full explanation (called when Why tab opens) |
| POST | `/api/sql/meeting-summary` | Lazy meeting summary |
| POST | `/api/sql/review` | Find bugs + return fixed SQL |
| POST | `/api/sql/validate` | Validate a SQL string |
| POST | `/api/sql/execute` | Run SQL in DuckDB sandbox, return rows |
| GET | `/api/history/threads` | List threads |
| GET | `/api/history/threads/{id}` | Thread detail with turns |
| POST | `/api/history/threads` | Create thread |
| PATCH | `/api/history/turns/{id}/assumptions` | Update confirmed assumptions |
| GET | `/api/library` | List saved queries |
| POST | `/api/library` | Save a query |
| DELETE | `/api/library/{id}` | Delete a saved query |
| GET | `/api/library/bank` | Pre-built query templates |
| POST | `/api/voice/transcribe` | User-invoked transcription |
| POST | `/api/chat/meeting` | Streaming meeting-mode chat (SSE) |

---

## End-to-End Example

**Prompt:**
> Find the latest invoice per vendor where total spend is over 10k and rank vendors by monthly spend.

**Expected plan patterns:** `latest-row`, `ranking`, `grouped-aggregation`

**Expected SQL (PostgreSQL):**

```sql
-- grain: one row per vendor per month, ranked by monthly spend
WITH latest_invoice_per_vendor AS (
    SELECT
        vendor_id,
        invoice_id,
        invoice_date,
        total,
        ROW_NUMBER() OVER (PARTITION BY vendor_id ORDER BY invoice_date DESC) AS rn
    FROM invoices
),
latest AS (
    SELECT vendor_id, invoice_id, invoice_date, total
    FROM latest_invoice_per_vendor
    WHERE rn = 1
),
vendor_monthly_spend AS (
    SELECT
        vendor_id,
        DATE_TRUNC('month', invoice_date) AS month,
        SUM(total)                         AS monthly_spend
    FROM invoices
    GROUP BY vendor_id, DATE_TRUNC('month', invoice_date)
    HAVING SUM(total) > 10000
),
ranked AS (
    SELECT
        vendor_id,
        month,
        monthly_spend,
        RANK() OVER (PARTITION BY month ORDER BY monthly_spend DESC) AS monthly_rank
    FROM vendor_monthly_spend
)
SELECT
    r.vendor_id,
    r.month,
    r.monthly_spend,
    r.monthly_rank,
    l.invoice_id   AS latest_invoice_id,
    l.invoice_date AS latest_invoice_date
FROM ranked r
JOIN latest  l ON r.vendor_id = l.vendor_id
ORDER BY r.month DESC, r.monthly_rank ASC;
```

---

## Adding a New SQL Dialect

1. Add the value to `DialectType` in [apps/api/schemas/sql.py](apps/api/schemas/sql.py)
2. Add the SQLGlot dialect mapping in [apps/api/services/validator.py](apps/api/services/validator.py) `_DIALECT_MAP`
3. Add the UI option in [apps/web/src/components/DialectSelector.tsx](apps/web/src/components/DialectSelector.tsx)
4. Add to `Dialect` type in [packages/shared-types/src/index.ts](packages/shared-types/src/index.ts)

---

## Adding a Voice Backend

The `TranscriptionBackend` protocol in [apps/api/services/voice.py](apps/api/services/voice.py) is the extension point:

```python
class MyBackend:
    async def transcribe(self, audio_path: Path, language: str) -> tuple[str, float | None]:
        ...
```

Register it in `BACKENDS` and optionally auto-detect it at import time (see `whisper_backend.py` for the pattern).
