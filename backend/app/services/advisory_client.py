import os
from typing import Any

import httpx
from fastapi import HTTPException


async def fetch_advisories() -> Any:
    base_url = os.getenv("APPBACKEND_URL", "").rstrip("/")
    api_key = os.getenv("BROKER_ADVISORY_API_KEY", "").strip()
    if not base_url or not api_key:
        raise HTTPException(
            status_code=503,
            detail="Advisory service is not configured. Set APPBACKEND_URL and BROKER_ADVISORY_API_KEY.",
        )

    url = f"{base_url}/api/v1/broker/advisories/indian-equities"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                url,
                params={"limit": 50},
                headers={"X-Broker-API-Key": api_key, "Accept": "application/json"},
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Advisory service timed out.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Advisory service is temporarily unavailable.") from exc

    if response.is_error:
        raise HTTPException(
            status_code=response.status_code,
            detail="The upstream advisory service rejected the request.",
        )
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Advisory service returned invalid JSON.") from exc
