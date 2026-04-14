"""Test 2: Generate and validate routes via HTTP."""

import pytest
from unittest.mock import AsyncMock, patch

# We mock Ollama so tests run without a live model.

MOCK_PLAN = {
    "user_prompt": "Find the latest invoice per vendor",
    "cleaned_prompt": "Find the latest invoice per vendor.",
    "dialect": "postgresql",
    "query_type": "SELECT",
    "grain": "one row per vendor (latest invoice)",
    "tables": ["invoices"],
    "join_keys": ["vendor_id"],
    "joins": [],
    "filters": [],
    "aggregations": [],
    "window_functions": ["ROW_NUMBER() OVER (PARTITION BY vendor_id ORDER BY invoice_date DESC)"],
    "group_by": [],
    "order_by": ["invoice_date DESC"],
    "patterns": ["latest-row"],
    "output_columns": ["vendor_id", "invoice_id", "invoice_date", "total"],
    "assumptions": ["table is named invoices"],
    "ambiguities": [],
    "verification_checks": ["row count matches distinct vendor count"],
    "optimization_notes": ["index on (vendor_id, invoice_date)"],
    "confidence_rationale": "Pattern is clear, table name assumed.",
}

MOCK_SQL_JSON = {
    "sql": (
        "-- grain: one row per vendor (latest invoice)\n"
        "WITH ranked_invoices AS (\n"
        "    SELECT\n"
        "        vendor_id,\n"
        "        invoice_id,\n"
        "        invoice_date,\n"
        "        total,\n"
        "        ROW_NUMBER() OVER (PARTITION BY vendor_id ORDER BY invoice_date DESC) AS rn\n"
        "    FROM invoices\n"
        ")\n"
        "SELECT vendor_id, invoice_id, invoice_date, total\n"
        "FROM ranked_invoices\n"
        "WHERE rn = 1\n"
        "ORDER BY invoice_date DESC;"
    ),
    "optimized_sql": None,
}

MOCK_EXPLANATION = "This query finds the most recent invoice per vendor using ROW_NUMBER."
MOCK_MEETING = "We pull the latest invoice for each vendor by ranking within vendor groups."


class TestGenerateRoute:
    @patch("services.ollama_client.ollama.generate_json", new_callable=AsyncMock)
    @patch("services.ollama_client.ollama.generate", new_callable=AsyncMock)
    def test_generate_returns_200(self, mock_gen, mock_json, client):
        mock_json.side_effect = [MOCK_PLAN, MOCK_SQL_JSON]
        mock_gen.return_value = MOCK_EXPLANATION

        resp = client.post("/api/sql/generate", json={
            "prompt": "Find the latest invoice per vendor",
            "dialect": "postgresql",
        })
        assert resp.status_code == 200

    @patch("services.ollama_client.ollama.generate_json", new_callable=AsyncMock)
    @patch("services.ollama_client.ollama.generate", new_callable=AsyncMock)
    def test_generate_response_has_required_fields(self, mock_gen, mock_json, client):
        mock_json.side_effect = [MOCK_PLAN, MOCK_SQL_JSON]
        mock_gen.return_value = MOCK_EXPLANATION

        resp = client.post("/api/sql/generate", json={
            "prompt": "Find the latest invoice per vendor",
            "dialect": "postgresql",
        })
        body = resp.json()
        assert "thread_id" in body
        assert "sql" in body
        assert "plan" in body
        assert "explanation" in body
        assert "validation" in body
        assert "meeting_mode" in body

    @patch("services.ollama_client.ollama.generate_json", new_callable=AsyncMock)
    @patch("services.ollama_client.ollama.generate", new_callable=AsyncMock)
    def test_generate_persists_thread(self, mock_gen, mock_json, client):
        mock_json.side_effect = [MOCK_PLAN, MOCK_SQL_JSON]
        mock_gen.return_value = MOCK_EXPLANATION

        resp = client.post("/api/sql/generate", json={
            "prompt": "Find the latest invoice per vendor",
            "dialect": "postgresql",
        })
        thread_id = resp.json()["thread_id"]

        history_resp = client.get(f"/api/history/threads/{thread_id}")
        assert history_resp.status_code == 200
        body = history_resp.json()
        assert body["thread_id"] == thread_id
        assert len(body["turns"]) >= 1

    def test_generate_rejects_empty_prompt(self, client):
        resp = client.post("/api/sql/generate", json={"prompt": "", "dialect": "postgresql"})
        assert resp.status_code == 422

    def test_generate_rejects_invalid_dialect(self, client):
        resp = client.post("/api/sql/generate", json={"prompt": "hello", "dialect": "oracle"})
        assert resp.status_code == 422


class TestValidateRoute:
    def test_validate_clean_sql(self, client):
        sql = """
        WITH s AS (SELECT vendor_id, SUM(total) AS spend FROM invoices GROUP BY vendor_id)
        SELECT vendor_id, spend FROM s WHERE spend > 10000
        """
        resp = client.post("/api/sql/validate", json={"sql": sql, "dialect": "postgresql"})
        assert resp.status_code == 200
        body = resp.json()
        assert "is_valid" in body
        assert "confidence" in body
        assert body["confidence"] in ("high", "medium", "low")

    def test_validate_flags_cartesian(self, client):
        resp = client.post("/api/sql/validate", json={
            "sql": "SELECT a.id, b.name FROM orders a JOIN customers b",
            "dialect": "postgresql",
        })
        assert resp.status_code == 200
        codes = [w["code"] for w in resp.json()["warnings"]]
        assert "CARTESIAN_JOIN" in codes


class TestHistoryRoutes:
    def test_list_threads_returns_array(self, client):
        resp = client.get("/api/history/threads")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_thread(self, client):
        resp = client.post("/api/history/threads", json={"title": "Test thread", "dialect": "sqlite"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["title"] == "Test thread"
        assert body["dialect"] == "sqlite"
        assert "thread_id" in body

    def test_get_nonexistent_thread_404(self, client):
        resp = client.get("/api/history/threads/does-not-exist")
        assert resp.status_code == 404
