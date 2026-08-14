"""Runtime SOC settings adapted to the existing LLM-Guard pipeline."""
import copy
import threading

from rate_limiter import rate_limiter

_DEFAULTS = {
    "ml_threshold": 0.0,
    "firewall_categories_enabled": {
        "role_override": True,
        "persona_jailbreaks": True,
        "system_prompt_extraction": True,
        "privilege_escalation": True,
    },
    "role_injection_enabled": True,
    "max_prompt_length": 2000,
    "dlp_entities_enabled": {
        "CREDIT_CARD": True, "EMAIL_ADDRESS": True, "PHONE_NUMBER": True,
        "US_SSN": True, "PERSON": True, "LOCATION": True, "API_KEY": True,
    },
    "risk_level_thresholds": {"medium": 1, "high": 3},
    "rate_limit": {"max_requests": rate_limiter.max_requests, "window_seconds": rate_limiter.window_seconds},
}
_settings = copy.deepcopy(_DEFAULTS)
_lock = threading.RLock()

def get_settings():
    with _lock:
        return copy.deepcopy(_settings)

def update_settings(payload: dict):
    with _lock:
        for key in ("ml_threshold", "role_injection_enabled", "max_prompt_length"):
            if key in payload:
                _settings[key] = payload[key]
        for key in ("firewall_categories_enabled", "dlp_entities_enabled", "risk_level_thresholds", "rate_limit"):
            if key in payload and isinstance(payload[key], dict):
                _settings[key].update(payload[key])
        if "rate_limit" in payload:
            rate_limit = payload["rate_limit"]
            rate_limiter.update_limits(rate_limit.get("max_requests"), rate_limit.get("window_seconds"))
        return get_settings()

def reset_settings():
    global _settings
    with _lock:
        _settings = copy.deepcopy(_DEFAULTS)
        rate_limiter.update_limits(_settings["rate_limit"]["max_requests"], _settings["rate_limit"]["window_seconds"])
        return get_settings()
