"""
SOC Panel Routes
==================

Everything the standalone SOC panel (its own frontend, its own
login screen, its own directory: /soc-panel) talks to.

Mounted under the /soc prefix so it reads as a clearly separate
subsystem from the main /chat pipeline:

    POST /soc/login                    username + password -> bearer token
    POST /soc/logout                    revoke the current session
    GET  /soc/me                        who am I / is my session valid

    GET  /soc/dashboard/events          blocked-prompt review, paginated + filterable
    GET  /soc/dashboard/stats           aggregate stats for the overview cards
    GET  /soc/dashboard/settings        current guardrail sensitivity settings
    PUT  /soc/dashboard/settings        tune sensitivity (partial update, applies live)
    POST /soc/dashboard/settings/reset  restore factory-default sensitivity

Every /soc/dashboard/* route requires a valid session from
POST /soc/login (see soc_auth.require_soc_session) — this panel
does NOT use the x-api-key system that the main console uses.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from guardrail_settings import get_settings, update_settings, reset_settings
from rate_limiter import rate_limiter
from soc_auth import authenticate, create_session, revoke_session, require_soc_session
from telemetry import read_events, get_stats

router = APIRouter(prefix="/soc", tags=["SOC Panel"])


# ---------------------------------------------------------------
# Auth
# ---------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def soc_login(payload: LoginRequest):
    user = authenticate(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    session = create_session(user["username"], user["role"])
    return {
        "token": session["token"],
        "expires_at": session["expires_at"],
        "username": user["username"],
        "role": user["role"],
    }


@router.post("/logout")
async def soc_logout(caller: dict = Depends(require_soc_session)):
    revoke_session(caller["token"])
    return {"status": "logged out"}


@router.get("/me")
async def soc_me(caller: dict = Depends(require_soc_session)):
    return {"username": caller["username"], "role": caller["role"]}


# ---------------------------------------------------------------
# Blocked-prompt review
# ---------------------------------------------------------------

@router.get("/dashboard/events")
async def dashboard_events(
    limit: int = 50,
    offset: int = 0,
    status: Optional[str] = None,
    risk_level: Optional[str] = None,
    search: Optional[str] = None,
    caller: dict = Depends(require_soc_session),
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    return read_events(
        limit=limit,
        offset=offset,
        status=status,
        risk_level=risk_level,
        search=search,
    )


@router.get("/dashboard/stats")
async def dashboard_stats(caller: dict = Depends(require_soc_session)):
    return get_stats()


# ---------------------------------------------------------------
# Guardrail sensitivity tuning
# ---------------------------------------------------------------

@router.get("/dashboard/settings")
async def dashboard_get_settings(caller: dict = Depends(require_soc_session)):
    return get_settings()


@router.put("/dashboard/settings")
async def dashboard_update_settings(
    payload: dict,
    caller: dict = Depends(require_soc_session),
):
    updated = update_settings(payload)

    rate_limit = payload.get("rate_limit")
    if rate_limit:
        rate_limiter.update_limits(
            max_requests=rate_limit.get("max_requests"),
            window_seconds=rate_limit.get("window_seconds"),
        )

    return updated


@router.post("/dashboard/settings/reset")
async def dashboard_reset_settings(caller: dict = Depends(require_soc_session)):
    defaults = reset_settings()

    default_rate_limit = defaults.get("rate_limit", {})
    rate_limiter.update_limits(
        max_requests=default_rate_limit.get("max_requests"),
        window_seconds=default_rate_limit.get("window_seconds"),
    )

    return defaults
