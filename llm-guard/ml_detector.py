import joblib

from latency_audit import latency_audit

# Load model only once
model = joblib.load("jailbreak_detector.pkl")
vectorizer = joblib.load("vectorizer.pkl")


def _decision_score(features):
    if hasattr(model, "decision_function"):
        return float(model.decision_function(features)[0])
    if hasattr(model, "predict_proba"):
        return float(model.predict_proba(features)[0][1])
    return None


@latency_audit.measure("ML Jailbreak Detector")
def detect_jailbreak_detailed(message: str, threshold: float = 0.0):
    """Backward-compatible detailed detector used by the SOC panel."""
    features = vectorizer.transform([message])
    prediction = model.predict(features)[0]
    score = _decision_score(features)
    jailbreak = prediction == 1
    if score is not None and hasattr(model, "decision_function"):
        jailbreak = score >= threshold
    return {"prediction": "JAILBREAK" if jailbreak else "SAFE", "score": score}


def detect_jailbreak(message: str):
    return detect_jailbreak_detailed(message)["prediction"]
