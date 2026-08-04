import json
import logging
from datetime import datetime, timezone
from pathlib import Path

LOG_FILE = Path(__file__).parent / "telemetry.log"

logger = logging.getLogger("llm_guard_telemetry")
logger.setLevel(logging.INFO)

handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
formatter = logging.Formatter("%(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)


def log_event(
    status: str,
    reason: str = None,
    risk_level: str = None,
    ml_prediction: str = None,
    detected_items: list = None,
    output_detected_items: list = None,
    original_message: str = None,
):
    event = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "status": status,
    "reason": reason,
    "risk_level": risk_level,
    "ml_prediction": ml_prediction,
    "detected_items": detected_items or [],
    "output_detected_items": output_detected_items or [],
    "original_message": original_message,
}
    logger.info(json.dumps(event))
