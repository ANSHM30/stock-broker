from fastapi import APIRouter, status

from app.models.schemas import PaperOrder, PaperOrderRequest
from app.services.paper_trading import paper_trading_book

router = APIRouter(prefix="/api/paper/orders", tags=["paper trading"])


@router.get("", response_model=list[PaperOrder])
def list_paper_orders() -> list[PaperOrder]:
    return paper_trading_book.list_orders()


@router.post("", response_model=PaperOrder, status_code=status.HTTP_201_CREATED)
def create_paper_order(request: PaperOrderRequest) -> PaperOrder:
    return paper_trading_book.create_order(request)
