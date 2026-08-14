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
    ml_score: float = None,
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
        "ml_score": ml_score,
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
        ml_score=ml_score,
        detected_items=detected_items,
        output_detected_items=output_detected_items,
    )

def read_events(limit=50, offset=0, status=None, risk_level=None, search=None):
    """Return SOC-friendly event records from the existing SQLite history."""
    from database import _connection
    clauses, params = [], []
    if status:
        clauses.append("status = ?"); params.append(status)
    if risk_level:
        clauses.append("risk_level = ?"); params.append(risk_level)
    if search:
        clauses.append("(prompt LIKE ? OR reason LIKE ? OR detection_result LIKE ?)")
        q = f"%{search}%"; params.extend([q, q, q])
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    with _connection() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM prompt_history{where}", params).fetchone()[0]
        rows = conn.execute(f"SELECT * FROM prompt_history{where} ORDER BY created_at DESC LIMIT ? OFFSET ?", params + [limit, offset]).fetchall()
    events = []
    for row in rows:
        details = json.loads(row["analysis_details"] or "{}")
        events.append({
            "timestamp": row["created_at"], "status": row["status"], "risk_level": row["risk_level"],
            "ml_prediction": row["detection_result"], "ml_score": details.get("ml_score"),
            "reason": row["reason"], "original_message": row["prompt"],
            "detected_items": details.get("detected_items", []),
            "output_detected_items": details.get("output_detected_items", []),
        })
    return {"events": events, "total": total, "limit": limit, "offset": offset}

def get_stats():
    from database import _connection
    with _connection() as conn:
        rows = conn.execute("SELECT status, risk_level FROM prompt_history").fetchall()
    total = len(rows)
    blocked = sum(r["status"] == "Blocked" for r in rows)
    breakdown = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    for r in rows:
        if r["risk_level"] in breakdown:
            breakdown[r["risk_level"]] += 1
    return {
        "total_events": total,
        "blocked_total": blocked,
        "block_rate_pct": round(blocked / total * 100, 1) if total else 0,
        "risk_level_breakdown": breakdown,
    }
