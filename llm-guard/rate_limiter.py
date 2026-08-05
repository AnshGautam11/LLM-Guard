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

        # Stores request timestamps separately for each client.
        self.requests = defaultdict(deque)

        # Protects shared request data when multiple requests arrive together.
        self.lock = Lock()

    def is_allowed(self, client_id: str) -> Tuple[bool, int]:
        """
        Check whether a client is allowed to make another request.

        Returns:
            (True, 0)
                Request is allowed.

            (False, retry_after_seconds)
                Request is blocked because the rate limit was exceeded.
        """

        current_time = time.time()

        # Use a fallback ID if the client ID is missing.
        if not client_id:
            client_id = "unknown"

        with self.lock:
            request_times = self.requests[client_id]

            # Remove requests that are older than the current time window.
            while (
                request_times
                and current_time - request_times[0] >= self.window_seconds
            ):
                request_times.popleft()

            # Block when the maximum number of requests has been reached.
            if len(request_times) >= self.max_requests:

                oldest_request = request_times[0]

                retry_after = self.window_seconds - (
                    current_time - oldest_request
                )

                return False, max(1, int(retry_after))

            # Record the current request.
            request_times.append(current_time)

            return True, 0

    def reset_client(self, client_id: str) -> None:
        """
        Remove stored rate-limit data for a specific client.
        Useful during testing.
        """

        with self.lock:
            self.requests.pop(client_id, None)

    def clear(self) -> None:
        """
        Clear all stored rate-limit information.
        """

        with self.lock:
            self.requests.clear()


# ---------------------------------------------------------
# Global Rate Limiter
# ---------------------------------------------------------
# Each client can make a maximum of:
# 10 requests every 60 seconds.
#
# Request 1-10  -> Allowed
# Request 11+   -> Blocked until the window expires.
# ---------------------------------------------------------

rate_limiter = RateLimiter(
    max_requests=10,
    window_seconds=60
)