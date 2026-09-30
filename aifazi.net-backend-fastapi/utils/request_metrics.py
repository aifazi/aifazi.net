"""Rolling 24h counters for error responses, surfaced on /api/monitor/status.

Tracks 413 / 429 / 500 per route so the public status page can show whether
errors are structural or one-off. In-memory and per-process: the backend runs
a single uvicorn worker inside the Coolify container, so counters cover every
request it serves; they restart empty on redeploy (honest "since boot" view).
"""

import time

_WINDOW_S = 24 * 3600
_TRACKED = (413, 429, 500)
# Route paths can be high-cardinality (ids in the path). Truncate each path
# and cap distinct keys so an error storm across unique URLs can't grow the
# dict without bound.
_MAX_PATH = 120
_MAX_KEYS = 150
_MAX_SERIES = 500

_events: dict[tuple[str, int], list[float]] = {}


def record_error(path: str, status: int) -> None:
    """Count one error response. Silently drops untracked statuses."""
    if status not in _TRACKED:
        return
    key = (path[:_MAX_PATH], status)
    if key not in _events and len(_events) >= _MAX_KEYS:
        return
    series = _events.setdefault(key, [])
    series.append(time.time())
    if len(series) > _MAX_SERIES:
        del series[: len(series) - _MAX_SERIES]


def snapshot() -> list[dict]:
    """[{route, status, count}] for the trailing 24h, highest count first."""
    now = time.time()
    cutoff = now - _WINDOW_S
    out: list[dict] = []
    for key in list(_events):
        series = _events[key]
        while series and series[0] < cutoff:
            series.pop(0)
        if not series:
            del _events[key]
            continue
        route, status = key
        out.append({"route": route, "status": status, "count": len(series)})
    out.sort(key=lambda e: (-e["count"], e["route"]))
    return out[:25]
