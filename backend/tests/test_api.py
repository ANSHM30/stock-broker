from fastapi.testclient import TestClient
from httpx import Response

from app.main import app
from app.services.paper_trading import paper_trading_book
from app.services import advisory_client

client = TestClient(app)


def setup_function() -> None:
    with paper_trading_book._lock:
        paper_trading_book._available_cash = paper_trading_book._starting_cash
        paper_trading_book._orders.clear()


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_paper_order_updates_isolated_portfolio() -> None:
    response = client.post(
        "/api/paper/orders",
        json={"symbol": "infy", "quantity": 2, "reference_price": 1500},
    )
    assert response.status_code == 201
    order = response.json()
    assert order["symbol"] == "INFY"
    assert order["status"] == "SIMULATED"

    portfolio = client.get("/api/paper/portfolio").json()
    assert portfolio["mode"] == "PAPER"
    assert portfolio["real_orders_sent"] is False
    assert portfolio["available_cash"] == portfolio["starting_cash"] - 3000
    assert portfolio["positions"] == [
        {
            "symbol": "INFY",
            "quantity": 2,
            "average_reference_price": 1500,
            "invested_value": 3000,
        }
    ]


def test_paper_order_cannot_exceed_cash() -> None:
    response = client.post(
        "/api/paper/orders",
        json={"symbol": "INFY", "quantity": 10, "reference_price": 100000},
    )
    assert response.status_code == 422
    assert client.get("/api/paper/orders").json() == []


def test_paper_order_rejects_invalid_quantity() -> None:
    response = client.post(
        "/api/paper/orders",
        json={"symbol": "INFY", "quantity": 0, "reference_price": 100},
    )
    assert response.status_code == 422


def test_advisories_returns_explicit_unconfigured_error(monkeypatch) -> None:
    monkeypatch.delenv("APPBACKEND_URL", raising=False)
    monkeypatch.delenv("BROKER_ADVISORY_API_KEY", raising=False)
    response = client.get("/api/advisories")
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]


def test_advisories_proxy_uses_server_credentials(monkeypatch) -> None:
    monkeypatch.setenv("APPBACKEND_URL", "https://advisory.example/")
    monkeypatch.setenv("BROKER_ADVISORY_API_KEY", "server-only-key")

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, url, *, params, headers):
            assert url == "https://advisory.example/api/v1/broker/advisories/indian-equities"
            assert params == {"limit": 50}
            assert headers["X-Broker-API-Key"] == "server-only-key"
            return Response(200, json={"data": [{"symbol": "INFY"}]})

    monkeypatch.setattr(advisory_client.httpx, "AsyncClient", lambda **_kwargs: MockClient())
    response = client.get("/api/advisories")
    assert response.status_code == 200
    assert response.json() == {"data": [{"symbol": "INFY"}]}
