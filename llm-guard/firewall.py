import re

from latency_audit import latency_audit
from guardrail_settings import get_settings

BLOCKED_PATTERNS = {
    "role_override": [r"ignore (all )?(previous|prior|above) instructions", r"disregard (your|the) (rules|guidelines|instructions)", r"you are now (DAN|no longer|free from)", r"forget (everything|what) (you were|i) told", r"act as (if you have|though you have) no restrictions", r"pretend (you are|to be) (an? )?(unfiltered|uncensored|unrestricted)", r"ignore all restrictions"],
    "persona_jailbreaks": [r"\bDAN\b", r"developer mode", r"jailbreak(ed)?", r"opposite (day|mode)", r"evil (twin|confidant|version)"],
    "system_prompt_extraction": [r"(reveal|show|print|repeat) (your|the) (system prompt|instructions)", r"what (are|were) you told (to do|before)", r"repeat (everything|the text) above"],
    "privilege_escalation": [r"as an? (admin|administrator|root|developer) (user|account)?", r"i (am|'m) (your|the) (creator|developer|admin)", r"override safety (settings|protocols)"],
}
ROLE_INJECTION_PATTERNS = [r"^\s*system\s*:", r"^\s*assistant\s*:", r"\[/?(system|assistant)\]", r"<\|(system|assistant)\|>"]

def check_length(message):
    limit = int(get_settings().get("max_prompt_length", 2000))
    return (True, "") if len(message) <= limit else (False, f"Message exceeds max length of {limit} characters")

def check_blocked_patterns(message):
    settings = get_settings()
    enabled = settings.get("firewall_categories_enabled", {})
    for category, patterns in BLOCKED_PATTERNS.items():
        if not enabled.get(category, True):
            continue
        for pattern in patterns:
            if re.search(pattern, message, re.IGNORECASE):
                return False, f"Blocked: matched {category} pattern"
    if settings.get("role_injection_enabled", True):
        for pattern in ROLE_INJECTION_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                return False, "Blocked: attempted role injection"
    return True, ""

@latency_audit.measure("Firewall")
def apply_firewall(message):
    ok, reason = check_length(message)
    if not ok: return False, reason
    return check_blocked_patterns(message)
