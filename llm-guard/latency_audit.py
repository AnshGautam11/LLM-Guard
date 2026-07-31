import time
import logging
from functools import wraps

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger("LatencyAudit")


class LatencyAudit:
    def __init__(self):
        self.records = []

    def measure(self, component_name):
        def decorator(func):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                start = time.perf_counter()

                result = await func(*args, **kwargs)

                end = time.perf_counter()
                latency = (end - start) * 1000

                logger.info(f"{component_name}: {latency:.2f} ms")

                self.records.append({
                    "component": component_name,
                    "latency_ms": round(latency, 2)
                })

                return result

            @wraps(func)
            def sync_wrapper(*args, **kwargs):
                start = time.perf_counter()

                result = func(*args, **kwargs)

                end = time.perf_counter()
                latency = (end - start) * 1000

                logger.info(f"{component_name}: {latency:.2f} ms")

                self.records.append({
                    "component": component_name,
                    "latency_ms": round(latency, 2)
                })

                return result

            if hasattr(func, "__code__") and func.__code__.co_flags & 0x80:
                return async_wrapper

            return sync_wrapper

        return decorator

    def summary(self):
        total = sum(r["latency_ms"] for r in self.records)

        print("\n========== Latency Audit ==========")

        for r in self.records:
            print(f"{r['component']:20} {r['latency_ms']} ms")

        print("-----------------------------------")
        print(f"Total Added Latency : {round(total,2)} ms")
        print("===================================\n")


latency_audit = LatencyAudit()