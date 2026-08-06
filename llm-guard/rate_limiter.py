import os
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Tuple


class RateLimiter:
    """
    Thread-safe in-memory sliding-window rate limiter.
    Each client is allowed a fixed number of requests
    within a configured time window.
    """

    def __init__(self, max_requests: int = 10, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(deque)
        self.lock = Lock()

    def is_allowed(self, client_id: str) -> Tuple[bool, int]:
        current_time = time.time()
        if not client_id:
            client_id = "unknown"

        with self.lock:
            request_times = self.requests[client_id]
            while (
                request_times
                and current_time - request_times[0] >= self.window_seconds
            ):
                request_times.popleft()

            if len(request_times) >= self.max_requests:
                oldest_request = request_times[0]
                retry_after = self.window_seconds - (
                    current_time - oldest_request
                )
                return False, max(1, int(retry_after))

            request_times.append(current_time)
            return True, 0

    def reset_client(self, client_id: str) -> None:
        with self.lock:
            self.requests.pop(client_id, None)

    def clear(self) -> None:
        with self.lock:
            self.requests.clear()


rate_limiter = RateLimiter(
    max_requests=int(os.getenv("RATE_LIMIT_MAX_REQUESTS", 10)),
    window_seconds=int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", 60)),
)

