"""Client for the PHP case service (internal network, bearer-token authenticated)."""

from __future__ import annotations

import logging

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)


class CaseServiceError(RuntimeError):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def _client() -> httpx.AsyncClient:
    s = get_settings()
    return httpx.AsyncClient(
        base_url=s.case_service_url,
        timeout=10.0,
        headers={"Authorization": f"Bearer {s.case_service_token}", "Accept": "application/json"},
    )


async def create_case(payload: dict) -> dict:
    async with _client() as c:
        try:
            r = await c.post("/api/v1/cases", json=payload)
        except httpx.HTTPError as e:
            log.error("case service unreachable: %s", e)
            raise CaseServiceError("case service unreachable") from e
    if r.status_code >= 400:
        log.error("case service error %s: %s", r.status_code, r.text[:500])
        raise CaseServiceError("case service rejected the request", 502 if r.status_code >= 500 else 400)
    return r.json()


async def case_status(reference: str) -> dict | None:
    async with _client() as c:
        try:
            r = await c.get(f"/api/v1/cases/{reference}")
        except httpx.HTTPError as e:
            raise CaseServiceError("case service unreachable") from e
    if r.status_code == 404:
        return None
    if r.status_code >= 400:
        raise CaseServiceError("case service error")
    return r.json()


# ---- staff operations (used by the admin API) ----

async def _staff(method: str, path: str, **kw) -> tuple[int, object]:
    async with _client() as c:
        try:
            r = await c.request(method, path, **kw)
        except httpx.HTTPError as e:
            raise CaseServiceError("case service unreachable") from e
    try:
        body = r.json()
    except ValueError:
        body = {"error": r.text[:300]}
    return r.status_code, body


async def list_cases(status: str | None, case_type: str | None, limit: int, offset: int, relevance: str = "inbox"):
    params = {k: v for k, v in {"status": status, "type": case_type, "limit": limit, "offset": offset,
                                "relevance": relevance}.items() if v is not None}
    return await _staff("GET", "/api/v1/cases", params=params)


async def case_details(reference: str):
    return await _staff("GET", f"/api/v1/cases/{reference}/details")


async def update_case(reference: str, payload: dict):
    return await _staff("PATCH", f"/api/v1/cases/{reference}", json=payload)


async def routing_table():
    return await _staff("GET", "/api/v1/routing")
