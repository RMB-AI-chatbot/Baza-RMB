"""Client identification (hashed), rate limiting and admin authentication."""

from __future__ import annotations

import hashlib
import hmac
import time
from collections import defaultdict, deque

from fastapi import Header, HTTPException, Request

from app.config import get_settings


def client_ip(request: Request) -> str:
    s = get_settings()
    if s.trust_proxy:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()
    return request.client.host if request.client else "unknown"


def client_hash(request: Request) -> str:
    salt = get_settings().client_hash_salt.encode()
    return hmac.new(salt, client_ip(request).encode(), hashlib.sha256).hexdigest()[:32]


class RateLimiter:
    """Sliding-window limiter, per client hash. In-process: with several workers or
    servers, move this to Redis (or rely on nginx limit_req, configured as well)."""

    def __init__(self):
        self.minute: dict[str, deque] = defaultdict(deque)
        self.day: dict[str, deque] = defaultdict(deque)

    def check(self, key: str) -> bool:
        s = get_settings()
        now = time.monotonic()
        for window, limit, span in ((self.minute, s.rate_limit_per_minute, 60), (self.day, s.rate_limit_per_day, 86400)):
            q = window[key]
            while q and now - q[0] > span:
                q.popleft()
            if len(q) >= limit:
                return False
        self.minute[key].append(now)
        self.day[key].append(now)
        if len(self.minute) > 50_000:  # crude memory bound
            for k in list(self.minute)[:10_000]:
                self.minute.pop(k, None)
                self.day.pop(k, None)
        return True


limiter = RateLimiter()


def require_admin(x_admin_key: str = Header(default="")) -> str:
    expected = get_settings().admin_api_key
    if not expected or expected == "change-me" or not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(status_code=401, detail="invalid admin key")
    return "admin"
