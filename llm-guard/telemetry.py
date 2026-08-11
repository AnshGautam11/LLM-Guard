import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from database import log_security_event


# =========================================================
# TELEMETRY LOG FILE
# =========================================================

LOG_FILE = Path(__file__).parent / "telemetry.log"


# =========================================================
# LOGGER CONFIGURATION
# =========================================================

logger = logging.getLogger("llm_guard_telemetry")
logger.setLevel(logging.INFO)

# Prevent duplicate log handlers during reloads
if not logger.handlers:
    handler = logging.FileHandler(
        LOG_FILE,
        encoding="utf-8"
    )

    formatter = logging.Formatter("%(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)


# =========================================================
# TELEMETRY EVENT LOGGER
# =========================================================

def log_event(
    status: str,
    user_id: str = None,
    reason: str = None,
    firewall_rule: str = None,
    risk_level: str = None,
    ml_prediction: str = None,
    detected_items: list = None,
    output_detected_items: list = None,
    original_message: str = None,
):
    """
    Record a telemetry/security event.

    Records:
    - timestamp
    - user ID
    - status
    - firewall rule
    - reason
    - risk level
    - ML prediction
    - detected sensitive items
    - output sensitive items
    - original prompt

    The event is stored in:
    1. telemetry.log
    2. SQLite telemetry database
    """

    timestamp = datetime.now(timezone.utc).isoformat()

    event = {
        "timestamp": timestamp,
        "status": status,
        "user_id": user_id,
        "firewall_rule": firewall_rule,
        "reason": reason,
        "risk_level": risk_level,
        "ml_prediction": ml_prediction,
        "detected_items": detected_items or [],
        "output_detected_items": output_detected_items or [],
        "original_message": original_message,
    }

    # =====================================================
    # SAVE EVENT TO TELEMETRY LOG FILE
    # =====================================================

    logger.info(json.dumps(event))

    # =====================================================
    # SAVE EVENT TO SQLITE DATABASE
    # =====================================================

    log_security_event(
        user_id=user_id,
        status=status,
        prompt=original_message,
        firewall_rule=firewall_rule,
        reason=reason,
        risk_level=risk_level,
        ml_prediction=ml_prediction,
    )