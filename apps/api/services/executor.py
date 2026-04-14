"""DuckDB in-memory SQL execution sandbox.

Each execution gets a fresh in-memory DuckDB connection — fully isolated,
no persistence between runs, no file system access by default.

Safety model:
  - No ATTACH / COPY TO / INSTALL / LOAD statements allowed.
  - Max 10 000 result rows returned to the client.
  - Execution timeout enforced via asyncio.wait_for.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_MAX_ROWS = 10_000
_TIMEOUT_SECONDS = 30

# Patterns that shouldn't be executed in the sandbox
_BLOCKED = re.compile(
    r"\b(ATTACH|DETACH|COPY\s+\w+\s+TO|INSTALL|LOAD|PRAGMA|SET\s+FILE|EXPORT)\b",
    re.IGNORECASE,
)


class ExecuteResult:
    def __init__(
        self,
        columns: list[str],
        rows: list[list[Any]],
        row_count: int,
        truncated: bool,
        error: str | None = None,
    ) -> None:
        self.columns = columns
        self.rows = rows
        self.row_count = row_count
        self.truncated = truncated
        self.error = error

    def to_dict(self) -> dict:
        return {
            "columns": self.columns,
            "rows": self.rows,
            "row_count": self.row_count,
            "truncated": self.truncated,
            "error": self.error,
        }


def _run_sync(sql: str) -> ExecuteResult:
    try:
        import duckdb
    except ImportError:
        return ExecuteResult([], [], 0, False, "duckdb is not installed. Run: pip install duckdb")

    if _BLOCKED.search(sql):
        return ExecuteResult([], [], 0, False, "Statement type blocked in the sandbox.")

    try:
        con = duckdb.connect(":memory:")
        rel = con.execute(sql)
        if rel is None:
            return ExecuteResult([], [], 0, False, "Query returned no result set.")

        columns = [desc[0] for desc in rel.description]
        all_rows = rel.fetchall()
        truncated = len(all_rows) > _MAX_ROWS
        rows = [list(r) for r in all_rows[:_MAX_ROWS]]
        return ExecuteResult(columns, rows, len(all_rows), truncated)
    except Exception as exc:
        return ExecuteResult([], [], 0, False, str(exc))
    finally:
        try:
            con.close()
        except Exception:
            pass


async def execute_sql(sql: str) -> ExecuteResult:
    """Run SQL in DuckDB (thread pool, with timeout)."""
    loop = asyncio.get_event_loop()
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(None, _run_sync, sql),
            timeout=_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        result = ExecuteResult([], [], 0, False, f"Query timed out after {_TIMEOUT_SECONDS}s.")
    return result
