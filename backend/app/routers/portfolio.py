from fastapi import APIRouter

from app.models.schemas import PaperPortfolio
from app.services.paper_trading import paper_trading_book

router = APIRouter(prefix="/api/paper/portfolio", tags=["paper trading"])


@router.get("", response_model=PaperPortfolio)
def get_paper_portfolio() -> PaperPortfolio:
    return paper_trading_book.portfolio()
