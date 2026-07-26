"""utils/cache.py — Simple TTL-based in-memory cache for frequently-queried static data.
Each worker process maintains its own cache; invalidates after TTL or on write.
"""
import time
from typing import Any, Callable

_cache: dict[str, tuple[float, Any]] = {}
DEFAULT_TTL = 60

def get(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    deadline, value = entry
    if time.monotonic() > deadline:
        del _cache[key]
        return None
    return value

def set(key: str, value: Any, ttl: int = DEFAULT_TTL) -> None:
    _cache[key] = (time.monotonic() + ttl, value)

def delete(key: str) -> None:
    _cache.pop(key, None)

def cached(ttl: int = DEFAULT_TTL):
    def decorator(fn: Callable):
        cache_key = f"fn:{fn.__module__}:{fn.__qualname__}"
        def wrapper(*args, **kwargs):
            existing = get(cache_key)
            if existing is not None:
                return existing
            result = fn(*args, **kwargs)
            set(cache_key, result, ttl)
            return result
        return wrapper
    return decorator
