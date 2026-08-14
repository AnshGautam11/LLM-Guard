"""
SOC Panel Authentication
=========================

A separate, self-contained login system for the standalone SOC
panel (its own directory, its own port, its own login screen) —
deliberately independent from the x-api-key system used by the
main console/chat pipeline (auth.py).

Security teams log in with a username + password. On success they
get a short-lived bearer session token that the SOC panel frontend
sends back as `Authorization: Bearer <token>` on every request to
the /soc/* endpoints in soc_routes.py.

Storage:
- Users:    soc_users.json   (username -> {password_hash, salt, role})
- Sessions: in-memory only (cleared on backend restart, forcing
  re-login — this is standard behaviour for this kind of tool and
  keeps things simple: no session table to manage).

Passwords are hashed with PBKDF2-HMAC-SHA256 (stdlib `hashlib`,
no extra dependency needed) with a random per-user salt.
"""

import hashlib
import json
import secrets
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Header, HTTPException

USERS_FILE = Path(__file__).parent / "soc_users.json"

SESSION_LIFETIME = timedelta(hours=8)  # a typical SOC shift
PBKDF2_ITERATIONS = 260_000

_lock = threading.Lock()
_sessions: dict = {}  # token -> {"username": str, "role": str, "expires_at": datetime}


# ---------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------

def _hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        PBKDF2_ITERATIONS,
    )
    return digest.hex(), salt


def _verify_password(password: str, password_hash: str, salt: str) -> bool:
    candidate, _ = _hash_password(password, salt)
    return secrets.compare_digest(candidate, password_hash)


# ---------------------------------------------------------------
# User store (soc_users.json)
# ---------------------------------------------------------------

def _load_users() -> dict:
    if not USERS_FILE.exists():
        # Seed a single default admin account on first run.
        default_password = "changeme-now!"
        password_hash, salt = _hash_password(default_password)
        users = {
            "admin": {
                "password_hash": password_hash,
                "salt": salt,
                "role": "admin",
            }
        }
        _save_users(users)
        return users

    try:
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save_users(users: dict) -> None:
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)


def create_or_update_user(username: str, password: str, role: str = "admin") -> None:
    """Used by manage_soc_users.py to add SOC engineers or reset a password."""
    with _lock:
        users = _load_users()
        password_hash, salt = _hash_password(password)
        users[username] = {"password_hash": password_hash, "salt": salt, "role": role}
        _save_users(users)


def delete_user(username: str) -> bool:
    with _lock:
        users = _load_users()
        if username not in users:
            return False
        del users[username]
        _save_users(users)
        return True


def list_users() -> list:
    return sorted(_load_users().keys())


# ---------------------------------------------------------------
# Login / sessions
# ---------------------------------------------------------------

def authenticate(username: str, password: str) -> Optional[dict]:
    """Returns {"username":..., "role":...} on success, else None."""
    users = _load_users()
    user = users.get(username)
    if not user:
        return None
    if not _verify_password(password, user["password_hash"], user["salt"]):
        return None
    return {"username": username, "role": user["role"]}


def create_session(username: str, role: str) -> dict:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + SESSION_LIFETIME
    with _lock:
        _sessions[token] = {
            "username": username,
            "role": role,
            "expires_at": expires_at,
        }
    return {"token": token, "expires_at": expires_at.isoformat()}


def revoke_session(token: str) -> None:
    with _lock:
        _sessions.pop(token, None)


def _get_session(token: str) -> Optional[dict]:
    with _lock:
        session = _sessions.get(token)
        if not session:
            return None
        if session["expires_at"] < datetime.now(timezone.utc):
            del _sessions[token]
            return None
        return session


# ---------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------

def require_soc_session(authorization: Optional[str] = Header(None)) -> dict:
    """
    Validates the `Authorization: Bearer <token>` header issued by
    POST /soc/login. Used as a dependency on every /soc/dashboard/*
    route so the SOC panel is gated by real login, not an API key.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed session token")

    token = authorization.split(" ", 1)[1].strip()
    session = _get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid — please log in again")

    return {"username": session["username"], "role": session["role"], "token": token}
