import time
import requests


URL = "http://127.0.0.1:8000/chat"

payload = {
    "message": "Tell me a fun fact about space"
}


print("=" * 55)
print("LLM-GUARD RATE LIMITER TEST")
print("=" * 55)

for request_number in range(1, 13):

    try:
        response = requests.post(
            URL,
            json=payload,
            timeout=10
        )

        data = response.json()

        print(
            f"Request {request_number:02d} | "
            f"HTTP {response.status_code} | "
            f"{data.get('status')}"
        )

        if data.get("error") == "Rate limit exceeded":
            print(
                "   RATE LIMIT BLOCKED REQUEST "
                f"{request_number}"
            )

            print(
                "   Retry after:",
                data.get("retry_after_seconds"),
                "seconds"
            )

    except Exception as error:
        print(
            f"Request {request_number:02d} | "
            f"ERROR: {error}"
        )

    time.sleep(0.1)


print("=" * 55)
print("TEST COMPLETE")
print("=" * 55)