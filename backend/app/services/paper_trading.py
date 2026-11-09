import os
from collections import defaultdict
from datetime import UTC, datetime
from threading import RLock
from uuid import uuid4

from fastapi import HTTPException

from app.models.schemas import PaperOrder, PaperOrderRequest, PaperPortfolio, PaperPosition


def _starting_cash() -> float:
    try:
        value = float(os.getenv("PAPER_STARTING_CASH", "500000"))
    except ValueError as exc:
        raise RuntimeError("PAPER_STARTING_CASH must be a positive number.") from exc
    if value <= 0:
        raise RuntimeError("PAPER_STARTING_CASH must be a positive number.")
    return value


class PaperTradingBook:
    """Single-process simulator; it never sends orders to a broker or exchange."""

    def __init__(self) -> None:
        self._starting_cash = _starting_cash()
        self._available_cash = self._starting_cash
        self._orders: list[PaperOrder] = []
        self._lock = RLock()

    def create_order(self, request: PaperOrderRequest) -> PaperOrder:
        total_value = round(request.quantity * request.reference_price, 2)
        with self._lock:
            if total_value > self._available_cash:
                raise HTTPException(status_code=422, detail="Order exceeds simulated available cash.")
            order = PaperOrder(
                id=uuid4(),
                symbol=request.symbol.upper(),
                quantity=request.quantity,
                reference_price=request.reference_price,
                total_value=total_value,
                created_at=datetime.now(UTC),
            )
            self._available_cash = round(self._available_cash - total_value, 2)
            self._orders.insert(0, order)
            return order

    def portfolio(self) -> PaperPortfolio:
        with self._lock:
            holdings: dict[str, list[float | int]] = defaultdict(lambda: [0, 0.0])
            for order in self._orders:
                holdings[order.symbol][0] += order.quantity
                holdings[order.symbol][1] += order.total_value
            positions = [
                PaperPosition(
                    symbol=symbol,
                    quantity=int(values[0]),
                    average_reference_price=round(float(values[1]) / int(values[0]), 2),
                    invested_value=round(float(values[1]), 2),
                )
                for symbol, values in sorted(holdings.items())
            ]
            return PaperPortfolio(
                starting_cash=self._starting_cash,
                available_cash=self._available_cash,
                reserved_value=round(self._starting_cash - self._available_cash, 2),
                positions=positions,
                orders=list(self._orders),
            )

    def list_orders(self) -> list[PaperOrder]:
        with self._lock:
            return list(self._orders)


paper_trading_book = PaperTradingBook()
