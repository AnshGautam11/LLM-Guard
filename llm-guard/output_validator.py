"""
output_validator.py

Secondary safety layer that inspects LLM-generated responses before they
reach the user. Complements the input-side Firewall + ML Jailbreak Detector
by catching things that only appear in *output*: toxic/unsafe generations,
hallucination signals, leaked secrets/PII, leaked system instructions, and
degenerate/oversized text.
=False immediately — nothing after a hard block is
      trusted or returned to the user.
    - Soft checks (hallucination, repetition) accumulate warnings but do
      not block, since blocking on every hedge word would make the
      endpoint unusable in practice.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from latency_audit import latency_audit

# ----------------------------------------------------------------------
# Configuration
# (kept as module-level constants — matches firewall.py's convention.
#  Move to config.py later if these need per-environment tuning.)
# ----------------------------------------------------------------------

MAX_RESPONSE_LENGTH = 1000

# Word-boundary regex, NOT substring matching — avoids false positives
# such as the old "kill" keyword matching inside "skill" / "skillet".
TOXIC_PATTERNS: list[str] = [
    r"\bkill\b",
    r"\bmurder\b",
    r"\bbomb\b",
    r"\bterrorist\b",
    r"\bhack(ing)?\s+wifi\b",
    r"\bbrute[-\s]?force\b",
    r"\bpassword[-\s]?crack(ing)?\b",
    r"\bmake\s+a\s+bomb\b",
    r"\bself[-\s]?harm\b",
]

HALLUCINATION_PATTERNS: list[str] = [
    r"\bmaybe\b",
    r"\bpossibly\b",
    r"\bprobably\b",
    r"\bi think\b",
    r"\bit seems\b",
    r"\bi('m| am) not (sure|certain)\b",
    r"\bas far as i know\b",
]

# The response should never echo the assistant's own internal role markers
# or system-prompt language back to the user — a strong signal that a
# prompt-injection succeeded server-side and is now leaking through output.
SYSTEM_LEAK_PATTERNS: list[str] = [
    r"\bsystem prompt\b",
    r"^\s*system\s*:",
    r"<\|(system|assistant)\|>",
    r"\[/?(system|assistant)\]",
]

EMAIL_PATTERN = re.compile(r"[\w.\-]+@[\w.\-]+\.\w+")
API_KEY_PATTERN = re.compile(
    r"sk-[A-Za-z0-9]{20,}"
    r"|AIza[A-Za-z0-9_\-]{35}"
    r"|gh[pousr]_[A-Za-z0-9]{36,}"
    r"|AKIA[0-9A-Z]{16}"
)

# Degenerate output: the same non-whitespace character repeated 20+ times
# in a row (e.g. "AAAA...", a stuck-token loop). Cheap proxy for a common
# real-LLM failure mode; also matches your mock_llm's "long response" case.
REPETITION_PATTERN = re.compile(r"(.)\1{19,}")


@dataclass
class OutputValidationResult:
    """Structured result of validating one LLM response.

    is_safe=False means the response must NOT be shown to the user —
    callers should treat `sanitized_response` as None in that case and
    return a blocked response instead.
    """

    is_safe: bool
    blocked_reason: str | None = None
    warnings: list[str] = field(default_factory=list)
    sanitized_response: str | None = None


def _check_toxicity(text: str) -> str | None:
    """Returns a block reason if unsafe content is detected, else None."""
    for pattern in TOXIC_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return f"Unsafe/toxic content detected (pattern: {pattern})"
    return None


def _check_system_leak(text: str) -> str | None:
    """Detects the response leaking internal system/role instructions."""
    for pattern in SYSTEM_LEAK_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE | re.MULTILINE):
            return "Response leaked internal system/role instructions"
    return None


def _check_hallucination(text: str) -> str | None:
    """Non-blocking: flags hedging/uncertainty language that suggests the
    response may be fabricated rather than factual."""
    for pattern in HALLUCINATION_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return "Possible hallucination detected (uncertain/hedging language)"
    return None


def _check_repetition(text: str) -> str | None:
    """Non-blocking: flags degenerate/repetitive output."""
    if REPETITION_PATTERN.search(text):
        return "Degenerate/repetitive output detected"
    return None


def _mask_sensitive_data(text: str) -> tuple[str, bool]:
    """Masks emails and API keys. Returns (masked_text, was_anything_masked).

    NOTE: this intentionally duplicates a subset of the Presidio-based DLP
    in main.py. Output validation must not depend on Presidio being reached
    — it's a last-resort net for secrets the model reproduces on its own
    (e.g. memorized during generation) rather than ones present in the
    user's input. Keep both layers; do not remove either.
    """
    masked = EMAIL_PATTERN.sub("<EMAIL>", text)
    masked = API_KEY_PATTERN.sub("<API_KEY>", masked)
    return masked, masked != text


def _enforce_length(text: str) -> tuple[str, bool]:
    """Truncates oversized responses. Returns (text, was_truncated)."""
    if len(text) > MAX_RESPONSE_LENGTH:
        return text[:MAX_RESPONSE_LENGTH] + "\n\n[Response Trimmed]", True
    return text, False


@latency_audit.measure("Output Validation")
def validate_output(response: str) -> OutputValidationResult:
    """Runs the full output-validation pipeline on an LLM response.

    Order matters: hard-block checks run first and short-circuit, so a
    toxic or leaking response is never masked/truncated/returned — it's
    rejected outright and the caller must not display `sanitized_response`.
    """
    if not response or not response.strip():
        return OutputValidationResult(
            is_safe=False,
            blocked_reason="Empty response from LLM",
        )

    # --- Hard blocks (short-circuit; nothing further is trusted) ---
    for hard_check in (_check_toxicity, _check_system_leak):
        reason = hard_check(response)
        if reason:
            return OutputValidationResult(is_safe=False, blocked_reason=reason)

    # --- Soft checks (accumulate warnings, do not block) ---
    warnings: list[str] = []
    for soft_check in (_check_hallucination, _check_repetition):
        warning = soft_check(response)
        if warning:
            warnings.append(warning)

    # --- Sanitization (always applied to whatever passed the hard checks) ---
    sanitized, was_masked = _mask_sensitive_data(response)
    if was_masked:
        warnings.append("Sensitive data (email/API key) masked in response")

    sanitized, was_truncated = _enforce_length(sanitized)
    if was_truncated:
        warnings.append(f"Response truncated to {MAX_RESPONSE_LENGTH} characters")

    return OutputValidationResult(
        is_safe=True,
        blocked_reason=None,
        warnings=warnings,
        sanitized_response=sanitized,
    )