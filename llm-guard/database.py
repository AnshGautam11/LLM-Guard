import sqlite3
from pathlib import Path
from datetime import datetime, timezone


DB_FILE = Path(__file__).parent / "telemetry.db"


def get_connection():
    return sqlite3.connect(DB_FILE)


def initialize_database():
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS security_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            user_id TEXT,
            status TEXT NOT NULL,
            prompt TEXT,
            firewall_rule TEXT,
            reason TEXT,
            risk_level TEXT,
            ml_prediction TEXT
        )
    """)

    connection.commit()
    connection.close()


def log_security_event(
    user_id=None,
    status="UNKNOWN",
    prompt=None,
    firewall_rule=None,
    reason=None,
    risk_level=None,
    ml_prediction=None
):
    connection = get_connection()
    cursor = connection.cursor()

    timestamp = datetime.now(timezone.utc).isoformat()

    cursor.execute("""
        INSERT INTO security_events (
            timestamp,
            user_id,
            status,
            prompt,
            firewall_rule,
            reason,
            risk_level,
            ml_prediction
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        timestamp,
        user_id,
        status,
        prompt,
        firewall_rule,
        reason,
        risk_level,
        ml_prediction
    ))

    connection.commit()
    connection.close()


initialize_database()