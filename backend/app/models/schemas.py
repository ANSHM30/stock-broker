from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PaperOrderRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    symbol: str = Field(min_length=1, max_length=24, pattern=r"^[A-Za-z0-9._-]+$")
    side: Literal["BUY", "SELL"] = "BUY"
    quantity: int = Field(gt=0, le=100_000)
    reference_price: float = Field(gt=0, le=10_000_000)


class PaperOrder(BaseModel):
    id: UUID
    symbol: str
    side: Literal["BUY", "SELL"] = "BUY"
    quantity: int
    reference_price: float
    total_value: float
    status: Literal["SIMULATED"] = "SIMULATED"
    created_at: datetime


class PaperPosition(BaseModel):
    symbol: str
    quantity: int
    average_reference_price: float
    invested_value: float


class PaperPortfolio(BaseModel):
    mode: Literal["PAPER"] = "PAPER"
    real_orders_sent: Literal[False] = False
    currency: Literal["INR"] = "INR"
    starting_cash: float
    available_cash: float
    reserved_value: float
    positions: list[PaperPosition]
    orders: list[PaperOrder]
