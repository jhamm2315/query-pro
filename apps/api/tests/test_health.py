"""Test 1: Health route."""


def test_health_returns_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "ollama" in body
    assert "model" in body


def test_root_returns_app_info(client):
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["app"] == "Query Pro"
    assert "docs" in body
