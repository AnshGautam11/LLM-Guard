from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import httpx
from owasp_mapper import get_owasp_mapping

from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_anonymizer import AnonymizerEngine

from firewall import apply_firewall
from ml_detector import detect_jailbreak
from telemetry import log_event
from config import get_active_llm_config
from rate_limiter import rate_limiter
from latency_audit import latency_audit
from output_validator import validate_output
from mock_llm import generate_mock_response

from fastapi.middleware.cors import CORSMiddleware


# =========================================================
# FASTAPI APPLICATION (PEHLE APP DEFINE KAREIN)
# =========================================================

app = FastAPI(
    title="LLM Guard",
    description="Security proxy for protecting LLM applications",
    version="1.0.0",
)


# =========================================================
# MIDDLEWARE (APP BANE KE BAAD ADD KAREIN)
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Sabhi origins allow karne ke liye
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# REQUEST MODEL
# =========================================================

class ChatRequest(BaseModel):
    message: str


# =========================================================
# LLM CONFIGURATION
# =========================================================

llm_config = get_active_llm_config()
TARGET_URL = llm_config.base_url

# Use mock LLM while testing the security pipeline.
USE_MOCK_LLM = True


# =========================================================
# PRESIDIO DLP INITIALIZATION
# =========================================================

analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()


# =========================================================
# CUSTOM API KEY RECOGNIZER
# =========================================================

api_key_patterns = [
    Pattern(
        name="openai_key",
        regex=r"sk-[A-Za-z0-9]{20,}",
        score=0.9,
    ),
    Pattern(
        name="google_key",
        regex=r"AIza[A-Za-z0-9_\-]{35}",
        score=0.9,
    ),
    Pattern(
        name="github_token",
        regex=r"gh[pousr]_[A-Za-z0-9]{36,}",
        score=0.9,
    ),
    Pattern(
        name="aws_access_key",
        regex=r"AKIA[0-9A-Z]{16}",
        score=0.9,
    ),
    Pattern(
        name="generic_secret",
        regex=r"\b[A-Za-z0-9_\-]{32,}\b",
        score=0.4,
    ),
]

api_key_recognizer = PatternRecognizer(
    supported_entity="API_KEY",
    patterns=api_key_patterns,
)

analyzer.registry.add_recognizer(api_key_recognizer)


# =========================================================
# INPUT DLP
# =========================================================

@latency_audit.measure("DLP Redaction")
def run_dlp_redaction(user_message: str):
    """
    Detect and anonymize sensitive information from
    the user's input before it reaches the LLM.
    """

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


# =========================================================
# OUTPUT DLP
# =========================================================

@latency_audit.measure("Output DLP Check")
def run_output_dlp(response_text: str):
    """
    Scan the LLM response for sensitive information before
    sending the response back to the user.
    """

    results = analyzer.analyze(
        text=response_text,
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
        text=response_text,
        analyzer_results=results,
    )

    return results, anonymized.text


# =========================================================
# UPSTREAM LLM
# =========================================================

@latency_audit.measure("Upstream LLM Call")
async def call_upstream_llm(payload: dict, headers: dict):

    async with httpx.AsyncClient(timeout=10.0) as client:

        response = await client.post(
            TARGET_URL,
            json=payload,
            headers=headers,
        )

        response.raise_for_status()

        return response.json()


# =========================================================
# MOCK LLM
# =========================================================

@latency_audit.measure("Mock LLM Call")
def call_mock_llm(safe_message: str) -> str:
    """
    Testing-only LLM path.

    Keeping this as a separate latency stage prevents mock
    timings from being mixed with real upstream LLM timings.
    """

    return generate_mock_response(safe_message)


# =========================================================
# ROOT ENDPOINT
# =========================================================

@app.get("/")
async def root():

    return {
        "message": "LLM Guard API is running"
    }


# =========================================================
# LATENCY AUDIT ENDPOINT
# =========================================================

@app.get("/audit/summary")
async def audit_summary():
    """
    Return latency information collected from the
    security pipeline.
    """

    latency_audit.summary()

    non_llm_total = sum(
        record["latency_ms"]
        for record in latency_audit.records
        if record["component"]
        not in ("Upstream LLM Call", "Mock LLM Call")
    )

    llm_total = sum(
        record["latency_ms"]
        for record in latency_audit.records
        if record["component"]
        in ("Upstream LLM Call", "Mock LLM Call")
    )

    return {
        "records": latency_audit.records,
        "security_layer_added_latency_ms": round(
            non_llm_total,
            2,
        ),
        "upstream_llm_latency_ms": round(
            llm_total,
            2,
        ),
    }


# =========================================================
# CHAT / SECURITY PROXY
# =========================================================

@app.post("/chat")
@latency_audit.measure("Proxy")
async def proxy_chat(
    request: ChatRequest,
    http_request: Request,
):

    user_message = request.message

    # =====================================================
    # 1. RATE LIMITING
    # =====================================================

    client_ip = (
        http_request.client.host
        if http_request.client
        else "unknown"
    )

    allowed, retry_after = rate_limiter.is_allowed(client_ip)

    if not allowed:
        log_event(
            status="Blocked",
            reason="Rate limit exceeded",
            original_message=user_message,
        )

        return JSONResponse(
            status_code=429,
            content={
                "status": "Blocked",
                "error": "Rate limit exceeded",
                "reason": "Too many requests from this client",
                "retry_after_seconds": retry_after,
                "owasp": get_owasp_mapping("rate_limit"),
            },
            headers={
                "Retry-After": str(retry_after)
            },
        )


    # =====================================================
    # 2. FIREWALL CHECK
    # =====================================================

    is_safe, reason = apply_firewall(user_message)

    if not is_safe:

        log_event(
            status="Blocked",
            reason=reason,
            original_message=user_message,
        )

        return {
    "status": "Blocked",
    "error": "Request blocked by firewall",
    "reason": reason,
    "owasp": get_owasp_mapping("firewall"),
}


    # =====================================================
    # 3. ML JAILBREAK DETECTION
    # =====================================================

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
            "reason": (
                "ML model classified this prompt "
                "as a jailbreak attempt"
            ),
        }


    # =====================================================
    # 4. INPUT DLP / PII REDACTION
    # =====================================================

    results, safe_message = run_dlp_redaction(
        user_message
    )


    # =====================================================
    # 5. RISK LEVEL
    # =====================================================

    risk_level = "LOW"

    if len(results) >= 3:
        risk_level = "HIGH"

    elif len(results) >= 1:
        risk_level = "MEDIUM"


    # =====================================================
    # 6. BUILD UPSTREAM REQUEST
    # =====================================================

    def build_upstream_request(
        config,
        message: str,
    ):

        if config.provider == "openai":

            return {
                "model": config.model,
                "messages": [
                    {
                        "role": "user",
                        "content": message,
                    }
                ],
            }

        return {
            "message": message
        }


    # =====================================================
    # 7. GET LLM RESPONSE
    # =====================================================

    if USE_MOCK_LLM:

        llm_response_text = call_mock_llm(
            safe_message
        )

    else:

        try:

            payload = build_upstream_request(
                llm_config,
                safe_message,
            )

            headers = {}

            if llm_config.api_key:

                headers["Authorization"] = (
                    f"Bearer {llm_config.api_key}"
                )

            raw_upstream_data = await call_upstream_llm(
                payload,
                headers,
            )

            llm_response_text = str(
                raw_upstream_data
            )


        except httpx.TimeoutException:

            log_event(
                status="Failed",
                reason="Upstream API timed out",
                original_message=user_message,
            )

            return {
                "status": "Failed",
                "error": "Upstream API timed out",
                "original_message": user_message,
                "safe_message_sent": safe_message,
            }


        except httpx.HTTPStatusError as error:

            log_event(
                status="Failed",
                reason=(
                    "Upstream API returned "
                    f"{error.response.status_code}"
                ),
                original_message=user_message,
            )

            return {
                "status": "Failed",
                "error": (
                    "Upstream API returned "
                    f"{error.response.status_code}"
                ),
                "original_message": user_message,
                "safe_message_sent": safe_message,
            }


        except Exception as error:

            log_event(
                status="Failed",
                reason=str(error),
                original_message=user_message,
            )

            return {
                "status": "Failed",
                "error": str(error),
                "original_message": user_message,
                "safe_message_sent": safe_message,
            }


    # =====================================================
    # 8. OUTPUT DLP
    # =====================================================

    output_results, safe_output = run_output_dlp(
        llm_response_text
    )


    # =====================================================
    # 9. OUTPUT VALIDATION
    # =====================================================

    validation = validate_output(
        safe_output
    )

    if not validation.is_safe:

        log_event(
            status="Blocked",
            reason=(
                "Output Validation: "
                f"{validation.blocked_reason}"
            ),
            ml_prediction=ml_prediction,
            original_message=user_message,
        )

        return {
            "status": "Blocked",
            "error": (
                "Response blocked by output validation"
            ),
            "reason": validation.blocked_reason,
        }


     # =====================================================
    # 10. TELEMETRY
    # =====================================================

    input_detected_items = [
        result.entity_type
        for result in results
    ]

    output_detected_items = [
        result.entity_type
        for result in output_results
    ]

    # Map detected sensitive data to OWASP API Security Top 10
    owasp_findings = []

    if input_detected_items or output_detected_items:
        owasp_findings.append(
            get_owasp_mapping("sensitive_data")
        )

    log_event(
        status="Processed Successfully",
        risk_level=risk_level,
        detected_items=input_detected_items,
        output_detected_items=output_detected_items,
        ml_prediction=ml_prediction,
    )

    # =====================================================
    # 11. FINAL SAFE RESPONSE
    # =====================================================

    return {
        "status": "Processed Successfully",
        "risk_level": risk_level,
        "total_sensitive_items": len(results),
        "original_message": user_message,
        "safe_message_sent": safe_message,
        "detected_items": input_detected_items,
        "ml_prediction": ml_prediction,
        "owasp_findings": owasp_findings,
        "upstream_response": safe_output,
        "output_warnings": validation.warnings,
        "output_sensitive_items": len(output_results),
        "output_detected_items": output_detected_items,
    }