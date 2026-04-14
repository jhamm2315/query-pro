# Query Pro

A local-first, privacy-first SQL workspace for analysts and engineers.

Converts typed prompts or local voice transcripts into:
- A structured SQL **plan** (JSON)
- Dialect-specific **SQL** (PostgreSQL, T-SQL, MySQL, SQLite)
- A plain-English **explanation**
- **Validation** notes and confidence level
- A short **meeting-ready** verbal summary

Everything runs on your machine. No data leaves your environment.

---

## Architecture

```
sql-copilot-local/
  apps/
    api/          FastAPI backend (Python)
    web/          React + Vite + Tailwind frontend
  packages/
    shared-types/ TypeScript type definitions
    prompt-templates/ Versioned LLM prompt files
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

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check + Ollama status |
| POST | `/api/sql/generate` | Full pipeline (plan → SQL → explain → validate → meeting) |
| POST | `/api/sql/plan` | Planner only |
| POST | `/api/sql/validate` | Validate a SQL string |
| GET | `/api/history/threads` | List threads |
| GET | `/api/history/threads/{id}` | Thread detail with turns |
| POST | `/api/history/threads` | Create thread |
| POST | `/api/voice/transcribe` | User-invoked transcription |

---

## Adding a New SQL Dialect

1. Add the value to `DialectType` in [apps/api/schemas/sql.py](apps/api/schemas/sql.py)
2. Add the SQLGlot dialect mapping in [apps/api/services/validator.py](apps/api/services/validator.py) `_DIALECT_MAP`
3. Add the UI option in [apps/web/src/components/DialectSelector.tsx](apps/web/src/components/DialectSelector.tsx)
4. Add to `Dialect` type in [packages/shared-types/src/index.ts](packages/shared-types/src/index.ts)

---

## Adding a Voice Backend

1. Create `apps/api/services/whisper_backend.py` implementing the `TranscriptionBackend` protocol
2. Register it in `BACKENDS` in [apps/api/services/voice.py](apps/api/services/voice.py)
3. Set `VOICE_BACKEND=whisper` in `.env`

---

## Next Steps

See [docs/architecture.md](docs/architecture.md) for the technical roadmap.

- [ ] Streaming SQL generation (SSE)
- [ ] Multi-turn conversation with context
- [ ] Whisper voice backend
- [ ] Schema upload (paste DDL / CSV headers for context)
- [ ] Query execution sandbox (DuckDB)
- [ ] Export to Notion / Markdown
- [ ] VS Code extension
