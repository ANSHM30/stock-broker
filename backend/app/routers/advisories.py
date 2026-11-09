from typing import Any

from fastapi import APIRouter

from app.services.advisory_client import fetch_advisories

router = APIRouter(prefix="/api", tags=["advisories"])


@router.get("/advisories")
async def get_advisories() -> Any:
    return await fetch_advisories()
