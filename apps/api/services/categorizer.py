"""Keyword-based thread categorizer — instant, no LLM call needed."""

import re

# Category definitions: (id, display_name, keywords)
_CATEGORIES = [
    ("Finance",    "Finance & Accounting",  ["invoice", "payment", "ledger", "revenue", "budget", "cost", "expense", "profit", "loss", "ar", "ap", "accounts receivable", "accounts payable", "cash flow", "balance", "billing", "subscription", "mrr", "arr", "churn"]),
    ("Sales",      "Sales & CRM",           ["customer", "deal", "pipeline", "conversion", "quota", "rep", "opportunity", "lead", "won", "lost", "sales", "crm", "prospect", "close rate", "funnel"]),
    ("Ecommerce",  "Ecommerce",             ["product", "cart", "checkout", "shipping", "return", "catalog", "sku", "order", "purchase", "basket", "refund", "fulfillment", "warehouse", "listing"]),
    ("HR",         "HR & People",           ["employee", "headcount", "payroll", "department", "hire", "attrition", "tenure", "salary", "team", "manager", "performance review", "turnover", "onboard"]),
    ("Marketing",  "Marketing & Growth",    ["campaign", "click", "impression", "email", "ctr", "cpc", "roas", "attribution", "channel", "acquisition", "funnel", "utm", "landing page", "open rate"]),
    ("Operations", "Operations & Supply",   ["inventory", "supplier", "stock", "shipment", "logistics", "defect", "sla", "throughput", "capacity", "utilization", "downtime"]),
    ("KPIs",       "KPIs & Dashboards",     ["kpi", "metric", "dashboard", "scorecard", "target", "goal", "okr", "north star", "benchmark", "trend", "yoy", "mom", "qoq", "rolling"]),
    ("DataQuality","Data Quality",          ["duplicate", "null", "missing", "audit", "validate", "clean", "reconcile", "mismatch", "orphan", "integrity", "anomaly"]),
]


def categorize(prompt: str, sql: str = "") -> str:
    """Return a category id based on keyword matching against the prompt and SQL."""
    text = (prompt + " " + sql).lower()
    # Remove common SQL noise so keywords match on business terms
    text = re.sub(r"\b(select|from|where|join|group by|order by|having|with|as|on|and|or|not|is|in|like|between|case|when|then|else|end)\b", " ", text)

    scores: dict[str, int] = {}
    for cat_id, _, keywords in _CATEGORIES:
        score = sum(1 for kw in keywords if kw in text)
        if score:
            scores[cat_id] = score

    if not scores:
        return "General"
    return max(scores, key=lambda k: scores[k])


CATEGORY_LABELS: dict[str, str] = {cat_id: name for cat_id, name, _ in _CATEGORIES}
CATEGORY_LABELS["General"] = "General"
