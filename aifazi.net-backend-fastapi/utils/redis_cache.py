"""
utils/redis_cache.py — Redis-backed distributed caching primitives.

Provides drop-in replacements for the in-memory dicts used by chat history,
send throttling, typing presence, and DM throttling. Falls back to in-memory
when Redis is unavailable (local dev).

All blocking Redis calls are wrapped in asyncio.to_thread for safe use in
FastAPI async handlers.
"""
import asyncio
import json
import logging
import time
from typing import Any

from utils.rate_limit import _get_redis, _redis_available

log = logging.getLogger("redis_cache")

# In-memory fallback stores (used when Redis is unavailable)
_local_store: dict[str, tuple[float, Any]] = {}
_local_sorted_sets: dict[str, list[tuple[float, str]]] = {}


async def cache_get(key: str, ttl: float = 20.0) -> Any | None:
    """Get a cached value. Returns None if missing or expired."""
    redis = _get_redis()
    if redis and _redis_available:
        try:
            raw = await asyncio.to_thread(redis.get, f"cache:{key}")
            if raw is None:
                return None
            data = json.loads(raw)
            if time.time() - data.get("_ts", 0) > ttl:
                await asyncio.to_thread(redis.delete, f"cache:{key}")
                return None
            return data.get("v")
        except Exception as e:
            log.warning("Redis cache_get failed: %s", e)
    # In-memory fallback
    entry = _local_store.get(key)
    if entry and time.time() - entry[0] < ttl:
        return entry[1]
    return None


async def cache_set(key: str, value: Any, ttl: float = 20.0) -> None:
    """Set a cached value with TTL in seconds."""
    redis = _get_redis()
    payload = json.dumps({"_ts": time.time(), "v": value}, default=str)
    if redis and _redis_available:
        try:
            await asyncio.to_thread(redis.setex, f"cache:{key}", int(ttl) + 1, payload)
            return
        except Exception as e:
            log.warning("Redis cache_set failed: %s", e)
    # In-memory fallback
    _local_store[key] = (time.time(), value)


async def cache_delete(key: str) -> None:
    """Delete a cached key."""
    redis = _get_redis()
    if redis and _redis_available:
        try:
            await asyncio.to_thread(redis.delete, f"cache:{key}")
        except Exception as e:
            log.warning("Redis cache_delete failed: %s", e)
    _local_store.pop(key, None)


async def cache_clear_pattern(pattern: str) -> None:
    """Delete all keys matching a glob pattern."""
    redis = _get_redis()
    if redis and _redis_available:
        try:
            full_pattern = f"cache:{pattern}"
            keys = []
            cursor = 0
            while True:
                cursor, batch = await asyncio.to_thread(redis.scan, cursor, match=full_pattern, count=100)
                keys.extend(batch)
                if cursor == 0:
                    break
            if keys:
                await asyncio.to_thread(redis.delete, *keys)
            return
        except Exception as e:
            log.warning("Redis cache_clear_pattern failed: %s", e)
    # In-memory: clear all (pattern matching is complex)
    to_delete = [k for k in _local_store if pattern.replace("*", "") in k]
    for k in to_delete:
        _local_store.pop(k, None)


# ── Sliding-window throttle (for chat send / DM throttle) ──────────────────

async def throttle_check(user_key: str, window: float, max_count: int) -> bool:
    """Check if user is within rate limit. Returns True if allowed, False if throttled."""
    redis = _get_redis()
    now = time.time()
    if redis and _redis_available:
        try:
            rkey = f"throttle:{user_key}"
            pipe = redis.pipeline()
            pipe.zremrangebyscore(rkey, 0, now - window)
            pipe.zcard(rkey)
            pipe.zadd(rkey, {str(now): now})
            pipe.expire(rkey, int(window) + 1)
            results = pipe.execute()
            return results[1] < max_count
        except Exception as e:
            log.warning("Redis throttle_check failed: %s", e)
    # In-memory fallback
    times = _local_sorted_sets.get(user_key, [])
    times = [(t, k) for t, k in times if now - t < window]
    if len(times) >= max_count:
        _local_sorted_sets[user_key] = times
        return False
    times.append((now, str(now)))
    _local_sorted_sets[user_key] = times
    return True


# ── Typing presence (Redis hash with per-field TTL via sorted set) ────────

_TYPING_TTL = 6.0


async def typing_set(room_id: str, username: str, activity: str = "typing") -> None:
    """Record that a user is active in a room."""
    redis = _get_redis()
    now = time.time()
    if redis and _redis_available:
        try:
            rkey = f"typing:{room_id}"
            field = json.dumps({"u": username, "a": activity})
            pipe = redis.pipeline()
            pipe.zadd(rkey, {field: now})
            pipe.expire(rkey, int(_TYPING_TTL) + 2)
            await asyncio.to_thread(pipe.execute)
            return
        except Exception as e:
            log.warning("Redis typing_set failed: %s", e)
    # In-memory fallback
    _local_store[f"typing:{room_id}:{username}"] = (now, activity)


async def typing_get(room_id: str, exclude_user: str) -> list[dict]:
    """Get users currently active in a room, excluding one user."""
    redis = _get_redis()
    now = time.time()
    if redis and _redis_available:
        try:
            rkey = f"typing:{room_id}"
            entries = await asyncio.to_thread(redis.zrangebyscore, rkey, 0, now)
            result = []
            for raw in entries:
                try:
                    data = json.loads(raw)
                    ts = await asyncio.to_thread(redis.zscore, rkey, raw)
                    if ts and (now - ts) < _TYPING_TTL and data.get("u") != exclude_user:
                        result.append({"username": data["u"], "activity": data.get("a", "typing")})
                except (json.JSONDecodeError, TypeError):
                    continue
            return result
        except Exception as e:
            log.warning("Redis typing_get failed: %s", e)
    # In-memory fallback
    result = []
    keys_to_delete = []
    for key, (ts, activity) in list(_local_store.items()):
        if not key.startswith(f"typing:{room_id}:"):
            continue
        uname = key.split(":", 2)[2]
        if now - ts > _TYPING_TTL:
            keys_to_delete.append(key)
            continue
        if uname != exclude_user:
            result.append({"username": uname, "activity": activity})
    for k in keys_to_delete:
        _local_store.pop(k, None)
    return result
