from fastapi import FastAPI
from pydantic import BaseModel
import httpx
from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_anonymizer import AnonymizerEngine
from firewall import apply_firewall
from ml_detector import detect_jailbreak
from config import get_active_llm_config
from telemetry import log_event
from latency_audit import latency_audit
from output_validator import validate_output
from mock_llm import generate_mock_response


class ChatRequest(BaseModel):
    message: str


app = FastAPI()

llm_config = get_active_llm_config()
TARGET_URL = llm_config.base_url


USE_MOCK_LLM = True

# Initialize Presidio
analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

# Custom recognizer for API Keys
api_key_patterns = [
    Pattern(name="openai_key", regex=r"sk-[A-Za-z0-9]{20,}", score=0.9),
    Pattern(name="google_key", regex=r"AIza[A-Za-z0-9_\-]{35}", score=0.9),
    Pattern(name="github_token", regex=r"gh[pousr]_[A-Za-z0-9]{36,}", score=0.9),
    Pattern(name="aws_access_key", regex=r"AKIA[0-9A-Z]{16}", score=0.9),
    Pattern(name="generic_secret", regex=r"\b[A-Za-z0-9_\-]{32,}\b", score=0.4),
]

api_key_recognizer = PatternRecognizer(
    supported_entity="API_KEY",
    patterns=api_key_patterns,
)

analyzer.registry.add_recognizer(api_key_recognizer)


@latency_audit.measure("DLP Redaction")
def run_dlp_redaction(user_message: str):
    """Presidio analyze + anonymize, measured as one DLP stage."""
    results = analyzer.analyze(
        text=user_message,
        language="en",
        entities=[
            "CREDIT_CARD",
            "EMAIL_ADDRESS",
            "PHONE_NUMBER",
            "US_SSN",
            "PERSON",
            "LOCATION",
            "API_KEY",
        ],
    )

    anonymized = anonymizer.anonymize(
        text=user_message,
        analyzer_results=results,
    )

    return results, anonymized.text


@latency_audit.measure("Upstream LLM Call")
async def call_upstream_llm(payload: dict, headers: dict):
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(TARGET_URL, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


@latency_audit.measure("Mock LLM Call")
def call_mock_llm(safe_message: str) -> str:
    """Testing-only path used while USE_MOCK_LLM is True. Kept as its own
    latency-measured stage (separate label from 'Upstream LLM Call') so
    /audit/summary doesn't blend mock and real call timings together.
    """
    return generate_mock_response(safe_message)


@app.get("/")
async def root():
    return {"message": "LLM Guard API is running"}


@app.get("/audit/summary")
async def audit_summary():
    """Prints the latency breakdown to console/logs and returns it as JSON.
    Use this after sending a few /chat requests to prove the security
    layer (Firewall + ML Detector + DLP + Output Validation) adds minimal
    latency vs. the upstream LLM call.
    """
    latency_audit.summary()

    non_llm_total = sum(
        r["latency_ms"] for r in latency_audit.records
        if r["component"] not in ("Upstream LLM Call", "Mock LLM Call")
    )
    llm_total = sum(
        r["latency_ms"] for r in latency_audit.records
        if r["component"] in ("Upstream LLM Call", "Mock LLM Call")
    )

    return {
        "records": latency_audit.records,
        "security_layer_added_latency_ms": round(non_llm_total, 2),
        "upstream_llm_latency_ms": round(llm_total, 2),
    }


@app.post("/chat")
@latency_audit.measure("Proxy")
async def proxy_chat(request: ChatRequest):
    user_message = request.message

    # Firewall Check
    is_safe, reason = apply_firewall(user_message)

    if not is_safe:
        log_event(status="Blocked", reason=reason, original_message=user_message)
        return {
            "status": "Blocked",
            "error": "Request blocked by firewall",
            "reason": reason,
        }

    # ML Jailbreak Detection
    ml_prediction = detect_jailbreak(user_message)

    if ml_prediction == "JAILBREAK":
        log_event(
            status="Blocked",
            reason="ML jailbreak detection",
            ml_prediction=ml_prediction,
            original_message=user_message,
        )
        return {
            "status": "Blocked",
            "error": "Request blocked by ML jailbreak detector",
            "reason": "ML model classified this prompt as a jailbreak attempt",
        }

    # Detect + Mask Sensitive Information (DLP stage, latency-measured)
    results, safe_message = run_dlp_redaction(user_message)

    # Risk Level
    risk_level = "LOW"

    if len(results) >= 3:
        risk_level = "HIGH"
    elif len(results) >= 1:
        risk_level = "MEDIUM"

    if ml_prediction == "JAILBREAK":
        risk_level = "HIGH"

    def build_upstream_request(llm_config, safe_message: str):
        if llm_config.provider == "openai":
            return {
                "model": llm_config.model,
                "messages": [{"role": "user", "content": safe_message}],
            }
        return {"message": safe_message}

    # Get LLM Response (mock during testing, real upstream otherwise)
    if USE_MOCK_LLM:
        llm_response_text = call_mock_llm(safe_message)
        raw_upstream_data = {"mock_response": llm_response_text}
    else:
        try:
            payload = build_upstream_request(llm_config, safe_message)
            headers = {"Authorization": f"Bearer {llm_config.api_key}"} if llm_config.api_key else {}
            raw_upstream_data = await call_upstream_llm(payload, headers)
            llm_response_text = str(raw_upstream_data)

        except httpx.TimeoutException:
            return {
                "status": "Failed",
                "error": "Upstream API timed out",
                "original_message": user_message,
                "safe_message_sent": safe_message,
            }

        except httpx.HTTPStatusError as e:
            return {
                "status": "Failed",
                "error": f"Upstream API returned {e.response.status_code}",
                "original_message": user_message,
                "safe_message_sent": safe_message,
            }

        except Exception as e:
            return {
                "status": "Failed",
                "error": str(e),
                "original_message": user_message,
                "safe_message_sent": safe_message,
            }

    # Output Validation (Week 3, Task 1) — secondary check on the LLM
    # response before anything is returned to the user.
    validation = validate_output(llm_response_text)

    if not validation.is_safe:
        log_event(
            status="Blocked",
            reason=f"Output Validation: {validation.blocked_reason}",
            ml_prediction=ml_prediction,
            original_message=user_message,
        )
        return {
            "status": "Blocked",
            "error": "Response blocked by output validation",
            "reason": validation.blocked_reason,
        }

    log_event(
        status="Processed Successfully",
        risk_level=risk_level,
        ml_prediction=ml_prediction,
        detected_items=[r.entity_type for r in results],
        original_message=user_message,
    )

    return {
        "status": "Processed Successfully",
        "risk_level": risk_level,
        "total_sensitive_items": len(results),
        "original_message": user_message,
        "safe_message_sent": safe_message,
        "detected_items": [r.entity_type for r in results],
        "ml_prediction": ml_prediction,
        "upstream_response": validation.sanitized_response,
        "output_warnings": validation.warnings,
    }