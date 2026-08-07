"""
OWASP API Security Top 10 mapping for LLM-Guard.

This module maps security events detected by LLM-Guard
to relevant OWASP API Security Top 10 (2023) categories.
"""


OWASP_MAPPINGS = {
    "rate_limit": {
        "id": "API4:2023",
        "name": "Unrestricted Resource Consumption",
        "description": (
            "The request exceeded the configured rate limit. "
            "Rate limiting helps prevent excessive resource consumption."
        ),
    },

    "bola": {
        "id": "API1:2023",
        "name": "Broken Object Level Authorization",
        "description": (
            "The request may attempt unauthorized access "
            "to an object or resource."
        ),
    },

    "firewall": {
        "id": "API8:2023",
        "name": "Security Misconfiguration",
        "description": (
            "The request was blocked by the security firewall "
            "because it violated configured security rules."
        ),
    },

    "sensitive_data": {
        "id": "API3:2023",
        "name": "Broken Object Property Level Authorization",
        "description": (
            "Sensitive information was detected and protected "
            "before being exposed through the API."
        ),
    },

    "unsafe_upstream": {
        "id": "API10:2023",
        "name": "Unsafe Consumption of APIs",
        "description": (
            "The upstream or LLM response contained unsafe "
            "or untrusted content requiring validation."
        ),
    },
}


def get_owasp_mapping(event_type: str) -> dict:
    """
    Return the OWASP API Security category associated
    with a detected LLM-Guard security event.
    """

    return OWASP_MAPPINGS.get(
        event_type,
        {
            "id": "UNMAPPED",
            "name": "Unmapped Security Event",
            "description": (
                "This security event does not currently have "
                "a specific OWASP API Security Top 10 mapping."
            ),
        },
    )