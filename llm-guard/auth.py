import os
from fastapi import Header, HTTPException, Depends
from typing import Optional

def _load_keys(env_var: str, role: str) -> dict:
    raw = os.getenv(env_var, "")
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    return {k: role for k in keys}

API_KEY_ROLES = {}
API_KEY_ROLES.update(_load_keys("ADMIN_API_KEYS", "admin"))
API_KEY_ROLES.update(_load_keys("DEVELOPER_API_KEYS", "developer"))
API_KEY_ROLES.update(_load_keys("VIEWER_API_KEYS", "viewer"))

def get_caller_role(x_api_key: Optional[str] = Header(None)) -> dict:
    if not x_api_key or x_api_key not in API_KEY_ROLES:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return {"api_key": x_api_key, "role": API_KEY_ROLES[x_api_key]}

def require_role(*allowed_roles: str):
    def dependency(caller: dict = Depends(get_caller_role)) -> dict:
        if caller["role"] not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{caller['role']}' not permitted for this endpoint",
            )
        return caller
    return dependency