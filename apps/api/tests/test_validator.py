"""Tests 3–8: Validator output and prompt patterns."""

import pytest
from services.validator import validate_sql


# ---------------------------------------------------------------------------
# Test 3: Validator output structure
# ---------------------------------------------------------------------------

class TestValidatorOutput:
    def test_valid_simple_select(self):
        sql = "SELECT id, name FROM users WHERE active = true"
        result = validate_sql(sql, dialect="postgresql")
        assert result.parsed_ok is True
        assert result.is_valid is True
        assert result.confidence in ("high", "medium", "low")
        assert result.confidence_rationale != ""

    def test_cartesian_join_detected(self):
        sql = "SELECT a.id, b.name FROM orders a JOIN customers b"
        result = validate_sql(sql, dialect="postgresql")
        codes = [w.code for w in result.warnings]
        assert "CARTESIAN_JOIN" in codes

    def test_where_having_misuse_detected(self):
        sql = "SELECT customer_id, SUM(amount) FROM orders WHERE SUM(amount) > 100 GROUP BY customer_id"
        result = validate_sql(sql, dialect="postgresql")
        codes = [w.code for w in result.warnings]
        assert "WHERE_HAVING_MISUSE" in codes

    def test_grain_ambiguity_flagged(self):
        sql = "SELECT a.id, b.name FROM orders a JOIN customers b ON a.customer_id = b.id"
        result = validate_sql(sql, dialect="postgresql")
        codes = [w.code for w in result.warnings]
        # No GROUP BY or window → grain ambiguity
        assert "GRAIN_AMBIGUITY" in codes or "DUPLICATE_INFLATION" in codes

    def test_clean_cte_sql_is_high_confidence(self):
        sql = """
        WITH vendor_spend AS (
            SELECT vendor_id, SUM(total) AS total_spend
            FROM invoices
            GROUP BY vendor_id
        )
        SELECT vendor_id, total_spend
        FROM vendor_spend
        WHERE total_spend > 10000
        ORDER BY total_spend DESC
        """
        result = validate_sql(sql, dialect="postgresql")
        assert result.parsed_ok is True
        assert result.confidence in ("high", "medium")

    def test_select_star_info_warning(self):
        sql = "SELECT * FROM invoices"
        result = validate_sql(sql, dialect="postgresql")
        codes = [w.code for w in result.warnings]
        assert "SELECT_STAR" in codes

    def test_confidence_levels_are_valid(self):
        sql = "SELECT id FROM users"
        result = validate_sql(sql)
        assert result.confidence in ("high", "medium", "low")

    def test_mysql_dialect(self):
        sql = "SELECT id, name FROM users LIMIT 10"
        result = validate_sql(sql, dialect="mysql")
        assert result.parsed_ok is True

    def test_tsql_dialect(self):
        sql = "SELECT TOP 10 id, name FROM users"
        result = validate_sql(sql, dialect="tsql")
        assert result.parsed_ok is True


# ---------------------------------------------------------------------------
# Test 4: Latest-record pattern
# ---------------------------------------------------------------------------

class TestLatestRecordPattern:
    LATEST_SQL = """
    WITH ranked_invoices AS (
        SELECT
            vendor_id,
            invoice_id,
            invoice_date,
            total,
            ROW_NUMBER() OVER (PARTITION BY vendor_id ORDER BY invoice_date DESC) AS rn
        FROM invoices
    )
    SELECT vendor_id, invoice_id, invoice_date, total
    FROM ranked_invoices
    WHERE rn = 1
    """

    def test_latest_row_sql_is_valid(self):
        result = validate_sql(self.LATEST_SQL, dialect="postgresql")
        assert result.parsed_ok is True
        assert result.is_valid is True

    def test_latest_row_has_no_cartesian(self):
        result = validate_sql(self.LATEST_SQL, dialect="postgresql")
        codes = [w.code for w in result.warnings]
        assert "CARTESIAN_JOIN" not in codes

    def test_latest_row_confidence_not_low(self):
        result = validate_sql(self.LATEST_SQL, dialect="postgresql")
        assert result.confidence in ("high", "medium")


# ---------------------------------------------------------------------------
# Test 5: Ranking pattern
# ---------------------------------------------------------------------------

class TestRankingPattern:
    RANKING_SQL = """
    WITH monthly_spend AS (
        SELECT
            vendor_id,
            DATE_TRUNC('month', invoice_date) AS month,
            SUM(total) AS total_spend
        FROM invoices
        GROUP BY vendor_id, DATE_TRUNC('month', invoice_date)
    ),
    ranked AS (
        SELECT
            vendor_id,
            month,
            total_spend,
            RANK() OVER (PARTITION BY month ORDER BY total_spend DESC) AS spend_rank
        FROM monthly_spend
    )
    SELECT vendor_id, month, total_spend, spend_rank
    FROM ranked
    ORDER BY month DESC, spend_rank ASC
    """

    def test_ranking_sql_parses(self):
        result = validate_sql(self.RANKING_SQL, dialect="postgresql")
        assert result.parsed_ok is True

    def test_ranking_sql_no_grain_ambiguity(self):
        result = validate_sql(self.RANKING_SQL, dialect="postgresql")
        codes = [w.code for w in result.warnings]
        assert "GRAIN_AMBIGUITY" not in codes

    def test_ranking_confidence_not_low(self):
        result = validate_sql(self.RANKING_SQL, dialect="postgresql")
        assert result.confidence in ("high", "medium")


# ---------------------------------------------------------------------------
# Test 6: Grouped aggregation pattern
# ---------------------------------------------------------------------------

class TestGroupedAggregation:
    AGG_SQL = """
    SELECT
        vendor_id,
        COUNT(*)         AS invoice_count,
        SUM(total)       AS total_spend,
        AVG(total)       AS avg_invoice,
        MAX(invoice_date) AS latest_invoice
    FROM invoices
    WHERE invoice_date >= '2024-01-01'
    GROUP BY vendor_id
    HAVING SUM(total) > 10000
    ORDER BY total_spend DESC
    """

    def test_grouped_agg_is_valid(self):
        result = validate_sql(self.AGG_SQL, dialect="postgresql")
        assert result.parsed_ok is True
        assert result.is_valid is True

    def test_grouped_agg_no_where_having_misuse(self):
        result = validate_sql(self.AGG_SQL, dialect="postgresql")
        codes = [w.code for w in result.warnings]
        assert "WHERE_HAVING_MISUSE" not in codes


# ---------------------------------------------------------------------------
# Test 7: Ambiguous prompt (missing table names, no join specified)
# ---------------------------------------------------------------------------

class TestAmbiguousPrompt:
    AMBIGUOUS_SQL = """
    SELECT a.id, b.description
    FROM table_a a
    JOIN table_b b ON a.b_id = b.id
    """

    def test_ambiguous_sql_parses(self):
        result = validate_sql(self.AMBIGUOUS_SQL, dialect="postgresql")
        assert result.parsed_ok is True

    def test_ambiguous_sql_has_grain_warning(self):
        result = validate_sql(self.AMBIGUOUS_SQL, dialect="postgresql")
        codes = [w.code for w in result.warnings]
        # A JOIN without GROUP BY or window is ambiguous grain
        assert "GRAIN_AMBIGUITY" in codes or "DUPLICATE_INFLATION" in codes


# ---------------------------------------------------------------------------
# Test 8: Duplicate inflation risk
# ---------------------------------------------------------------------------

class TestDuplicateInflationRisk:
    INFLATED_SQL = """
    SELECT o.order_id, o.total, c.name, t.tag_name
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN order_tags t ON o.order_id = t.order_id
    """

    def test_inflation_risk_flagged(self):
        result = validate_sql(self.INFLATED_SQL, dialect="postgresql")
        codes = [w.code for w in result.warnings]
        assert "DUPLICATE_INFLATION" in codes or "GRAIN_AMBIGUITY" in codes

    def test_confidence_is_not_high(self):
        result = validate_sql(self.INFLATED_SQL, dialect="postgresql")
        assert result.confidence in ("medium", "low")
