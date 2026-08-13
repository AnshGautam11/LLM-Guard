"""Persistent audit storage for the dashboard.

This module deliberately sits beside the security pipeline: it records the
pipeline's completed result but never participates in, or changes, detection.
"""
import json
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

DATABASE_PATH = Path(__file__).parent / "llm_guard_history.sqlite3"

def log_security_event(
    user_id=None,
    status=None,
    prompt=None,
    firewall_rule=None,
    reason=None,
    risk_level=None,
    ml_prediction=None,
):
    """Store a security telemetry event in the prompt history database."""
    result = {
        "status": status or "Failed",
        "risk_level": risk_level,
        "ml_prediction": ml_prediction,
        "reason": reason,
    }

    record_prompt(prompt or "", result)

def _connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with _connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS prompt_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt TEXT NOT NULL,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                risk_level TEXT,
                detection_result TEXT,
                reason TEXT,
                analysis_details TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_prompt_history_created_at ON prompt_history(created_at DESC)"
        )


def record_prompt(prompt: str, result: dict):
    """Save a completed result without changing the result returned to callers."""
    status = result.get("status", "Failed")
    detection_result = result.get("ml_prediction") or (
        "BLOCKED" if status == "Blocked" else "SAFE" if status == "Processed Successfully" else "FAILED"
    )
    details = {
        key: result[key]
        for key in ("detected_items", "output_detected_items", "owasp_findings", "total_sensitive_items")
        if key in result
    }
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO prompt_history
            (prompt, created_at, status, risk_level, detection_result, reason, analysis_details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                prompt,
                datetime.now(timezone.utc).isoformat(),
                status,
                result.get("risk_level"),
                detection_result,
                result.get("reason") or result.get("error"),
                json.dumps(details),
            ),
        )


def dashboard_data(limit: int = 100):
    with _connection() as connection:
        rows = connection.execute(
            "SELECT * FROM prompt_history ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        all_rows = connection.execute(
            "SELECT status, risk_level, detection_result, created_at FROM prompt_history"
        ).fetchall()

    total = len(all_rows)
    allowed = sum(row["status"] == "Processed Successfully" for row in all_rows)
    blocked = sum(row["status"] == "Blocked" for row in all_rows)
    threats = sum(
        row["status"] == "Blocked" or row["risk_level"] in ("MEDIUM", "HIGH")
        for row in all_rows
    )
    activity = Counter(row["created_at"][:10] for row in all_rows)
    categories = Counter(
        row["detection_result"] or "Unknown" for row in all_rows
        if row["status"] == "Blocked" or row["risk_level"] in ("MEDIUM", "HIGH")
    )
    return {
        "statistics": {
            "total_prompts": total,
            "allowed": allowed,
            "blocked": blocked,
            "threats_detected": threats,
            "success_rate": round((allowed / total) * 100, 1) if total else 0,
        },
        "history": [
            {
                **dict(row),
                "analysis_details": json.loads(row["analysis_details"]),
            }
            for row in rows
        ],
        "activity": [{"date": date, "count": count} for date, count in sorted(activity.items())],
        "threat_categories": [
            {"category": category, "count": count} for category, count in categories.most_common()
        ],
    }


initialize_database()
