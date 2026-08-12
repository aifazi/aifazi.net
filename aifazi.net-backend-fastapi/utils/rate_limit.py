"""
utils/rate_limit.py — Distributed rate limiting using Upstash Redis.

Provides sliding-window rate limiting that works across multiple serverless instances.
Falls back to in-memory if Redis is not configured (for local dev).
"""
import os
import time
import logging
from typing import Optional

log = logging.getLogger("rate_limit")

# In-memory fallback for local dev / when Redis not configured
_rl_store_local: dict[str, list[float]] = {}
_rl_last_cleanup: float = 0.0
_RL_CLEANUP_INTERVAL = 300

# IP ban cache (in-memory with TTL, refreshed from DB)
_ip_bans_cache: dict = {"networks": [], "fetched_at": 0.0}
_IP_BANS_TTL = 60.0

# Redis client (lazy initialization)
_redis_client = None
_redis_available = False


def _get_redis():
    """Lazy-initialize Upstash Redis client."""
    global _redis_client, _redis_available
    if _redis_client is not None:
        return _redis_client

    url = os.getenv("UPSTASH_REDIS_REST_URL")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN")

    if not url or not token:
        log.info("Upstash Redis not configured — using in-memory rate limiting (dev mode)")
        _redis_available = False
        return None

    try:
        from upstash_redis import Redis
        _redis_client = Redis(url=url, token=token)
        # Test connection
        _redis_client.ping()
        _redis_available = True
        log.info("Upstash Redis connected successfully")
    except Exception as e:
        log.warning("Failed to connect to Upstash Redis: %s — falling back to in-memory", e)
        _redis_available = False
        _redis_client = None

    return _redis_client


def is_redis_available() -> bool:
    """Check if Redis is available for distributed rate limiting."""
    return _get_redis() is not None


async def check_rate_limit(bucket: str, max_calls: int, window: int) -> bool:
    """
    Check and increment rate limit for a bucket using sliding window.

    Args:
        bucket: Unique identifier (e.g., "ip:path")
        max_calls: Maximum requests allowed in window
        window: Time window in seconds

    Returns:
        True if request is allowed, False if rate limited
    """
    redis = _get_redis()
    now = time.time()
    window_start = now - window

    if redis and _redis_available:
        try:
            key = f"rl:{bucket}"
            # Use pipeline for atomicity
            pipe = redis.pipeline()
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, window + 1)
            results = pipe.exec()

            current_count = results[1]
            return current_count < max_calls
        except Exception as e:
            log.warning("Redis rate limit check failed: %s — falling back to in-memory", e)
            # Fall through to in-memory

    # In-memory fallback
    _prune_local_store(now)
    ts = _rl_store_local.get(bucket, [])
    ts = [t for t in ts if now - t < window]
    if len(ts) >= max_calls:
        _rl_store_local[bucket] = ts
        return False
    ts.append(now)
    _rl_store_local[bucket] = ts
    return True


def _prune_local_store(now: float) -> None:
    """Remove expired buckets to prevent memory growth."""
    global _rl_last_cleanup
    if now - _rl_last_cleanup < _RL_CLEANUP_INTERVAL:
        return
    _rl_last_cleanup = now
    # We don't know the max window here, so use a reasonable default
    max_window = 300
    dead = [k for k, ts in _rl_store_local.items() if not ts or now - ts[-1] > max_window]
    for k in dead:
        del _rl_store_local[k]


def reset_rate_limit(bucket: str) -> None:
    """Reset rate limit for a specific bucket (e.g., on successful auth)."""
    redis = _get_redis()
    if redis and _redis_available:
        try:
            redis.delete(f"rl:{bucket}")
        except Exception:
            pass
    _rl_store_local.pop(bucket, None)


# IP Ban functions
import ipaddress


def _refresh_ip_bans(force: bool = False) -> None:
    """Refresh IP ban cache from database."""
    global _ip_bans_cache
    now = time.monotonic()
    if not force and now - _ip_bans_cache["fetched_at"] < _IP_BANS_TTL:
        return
    try:
        from database import supabase as _sb
        res = _sb.table("ip_bans").select("ip").execute()
        nets = []
        for row in (res.data or []):
            ip = (row.get("ip") or "").strip()
            if not ip:
                continue
            try:
                nets.append(ipaddress.ip_network(ip, strict=False))
            except ValueError:
                try:
                    nets.append(ipaddress.ip_network(f"{ip}/32", strict=False))
                except ValueError:
                    continue
        _ip_bans_cache["networks"] = nets
        _ip_bans_cache["fetched_at"] = now
    except Exception:
        _ip_bans_cache["fetched_at"] = now


def _ip_is_banned(ip: str) -> bool:
    """Check if an IP is banned."""
    try:
        addr = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return False
    _refresh_ip_bans()
    for net in _ip_bans_cache["networks"]:
        try:
            if addr in net:
                return True
        except TypeError:
            continue
    return False


def invalidate_ip_bans_cache() -> None:
    """Force refresh of IP bans cache on next check. Call after adding/removing bans."""
    global _ip_bans_cache
    _ip_bans_cache["fetched_at"] = 0.0

    # Also publish to Redis channel for cross-instance invalidation
    redis = _get_redis()
    if redis and _redis_available:
        try:
            redis.publish("ip_bans_invalidate", "refresh")
        except Exception:
            pass


# Background listener for cross-instance IP ban invalidation
# (Run this in a background task if needed)
async def start_ip_bans_listener():
    """Start listening for IP ban invalidation messages from other instances."""
    redis = _get_redis()
    if not redis or not _redis_available:
        return

    pubsub = redis.pubsub()
    await pubsub.subscribe("ip_bans_invalidate")
    log.info("Started IP bans invalidation listener")

    async for message in pubsub.listen():
        if message["type"] == "message":
            invalidate_ip_bans_cache()
            log.info("Received IP bans invalidation from peer")