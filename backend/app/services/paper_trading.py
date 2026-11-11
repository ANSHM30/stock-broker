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
            current_quantity = self._position_quantity(request.symbol)
            if request.side == "BUY" and total_value > self._available_cash:
                raise HTTPException(status_code=422, detail="Order exceeds simulated available cash.")
            if request.side == "SELL" and request.quantity > current_quantity:
                raise HTTPException(status_code=422, detail="Sell quantity exceeds simulated holdings.")
            order = PaperOrder(
                id=uuid4(),
                symbol=request.symbol.upper(),
                side=request.side,
                quantity=request.quantity,
                reference_price=request.reference_price,
                total_value=total_value,
                created_at=datetime.now(UTC),
            )
            cash_delta = -total_value if request.side == "BUY" else total_value
            self._available_cash = round(self._available_cash + cash_delta, 2)
            self._orders.insert(0, order)
            return order

    def _position_quantity(self, symbol: str) -> int:
        normalized_symbol = symbol.upper()
        quantity = 0
        for order in self._orders:
            if order.symbol != normalized_symbol:
                continue
            quantity += order.quantity if order.side == "BUY" else -order.quantity
        return quantity

    def portfolio(self) -> PaperPortfolio:
        with self._lock:
            holdings: dict[str, list[float | int]] = defaultdict(lambda: [0, 0.0])
            for order in reversed(self._orders):
                quantity, invested_value = holdings[order.symbol]
                if order.side == "BUY":
                    holdings[order.symbol][0] = quantity + order.quantity
                    holdings[order.symbol][1] = round(invested_value + order.total_value, 2)
                else:
                    average_cost = invested_value / quantity if quantity else 0
                    holdings[order.symbol][0] = quantity - order.quantity
                    holdings[order.symbol][1] = round(max(0, invested_value - average_cost * order.quantity), 2)
            positions = [
                PaperPosition(
                    symbol=symbol,
                    quantity=int(values[0]),
                    average_reference_price=round(float(values[1]) / int(values[0]), 2),
                    invested_value=round(float(values[1]), 2),
                )
                for symbol, values in sorted(holdings.items())
                if int(values[0]) > 0
            ]
            return PaperPortfolio(
                starting_cash=self._starting_cash,
                available_cash=self._available_cash,
                reserved_value=round(sum(float(values[1]) for values in holdings.values()), 2),
                positions=positions,
                orders=list(self._orders),
            )

    def list_orders(self) -> list[PaperOrder]:
        with self._lock:
            return list(self._orders)


paper_trading_book = PaperTradingBook()
