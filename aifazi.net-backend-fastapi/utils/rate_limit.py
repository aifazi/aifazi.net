"""
utils/rate_limit.py — Distributed rate limiting using Upstash Redis.

Provides sliding-window rate limiting that works across multiple serverless instances.
Falls back to in-memory if Redis is not configured (for local dev).
"""
import logging
import os
import time

log = logging.getLogger("rate_limit")

# In-memory fallback for local dev / when Redis not configured
_rl_store_local: dict[str, list[float]] = {}
_rl_last_cleanup: float = 0.0
_RL_CLEANUP_INTERVAL = 300

# IP ban cache (in-memory with TTL, refreshed from DB)
_ip_bans_cache: dict = {"networks": [], "fetched_at": 0.0}
_IP_BANS_TTL = 60.0

# 2FA lockout storage (distributed via Redis, in-memory fallback)
_2FA_LOCKOUT_WINDOW_S = 900
_2FA_MAX_FAILURES = 5
_2fa_failures_local: dict[str, list[float]] = {}

# Redis client (lazy initialization)
_redis_client = None
_redis_available = False


def _2fa_redis_key(username: str) -> str:
    return f"2fa:lockout:{username.lower()}"


def _2fa_locked_redis(username: str) -> bool:
    """Check if username is locked out via Redis (distributed)."""
    redis = _get_redis()
    if redis and _redis_available:
        try:
            key = _2fa_redis_key(username)
            count = redis.get(key)
            if count and int(count) >= _2FA_MAX_FAILURES:
                return True
        except Exception as e:
            log.warning("Redis 2FA lockout check failed: %s — falling back to in-memory", e)
    
    # Fallback to in-memory
    now = time.time()
    recent = [t for t in _2fa_failures_local.get(username, []) if now - t < _2FA_LOCKOUT_WINDOW_S]
    _2fa_failures_local[username] = recent
    return len(recent) >= _2FA_MAX_FAILURES


def _2fa_record_fail_redis(username: str) -> None:
    """Record a failed 2FA attempt via Redis (distributed)."""
    redis = _get_redis()
    if redis and _redis_available:
        try:
            key = _2fa_redis_key(username)
            # Use pipeline for atomicity
            pipe = redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, _2FA_LOCKOUT_WINDOW_S)
            pipe.execute()
            return
        except Exception as e:
            log.warning("Redis 2FA record fail failed: %s — falling back to in-memory", e)
    
    # Fallback to in-memory
    now = time.time()
    _2fa_failures_local.setdefault(username, []).append(now)
    _2fa_failures_local[username] = [t for t in _2fa_failures_local[username] if now - t < _2FA_LOCKOUT_WINDOW_S]


def _2fa_clear_fails_redis(username: str) -> None:
    """Clear 2FA failures for username (success clears lockout)."""
    redis = _get_redis()
    if redis and _redis_available:
        try:
            key = _2fa_redis_key(username)
            redis.delete(key)
        except Exception as e:
            log.warning("Redis 2FA clear fails failed: %s", e)
    
    # Also clear in-memory
    _2fa_failures_local.pop(username, None)


def _get_redis():
    """Lazy-initialize Redis client (standard redis-py or Upstash fallback)."""
    global _redis_client, _redis_available
    if _redis_client is not None:
        return _redis_client

    # Try standard Redis first (REDIS_URL)
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        try:
            import redis.asyncio as aioredis
            _redis_client = aioredis.from_url(redis_url, decode_responses=True)
            import asyncio
            try:
                asyncio.get_event_loop().run_until_complete(_redis_client.ping())
            except RuntimeError:
                loop = asyncio.new_event_loop()
                loop.run_until_complete(_redis_client.ping())
                loop.close()
            _redis_available = True
            log.info("Redis connected successfully (url=%s)", redis_url.split("@")[-1] if "@" in redis_url else redis_url)
            return _redis_client
        except Exception as e:
            log.warning("Failed to connect to Redis: %s", e)

    # Fallback to Upstash Redis
    url = os.getenv("UPSTASH_REDIS_REST_URL")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN")

    if not url or not token:
        if os.getenv("ENV", "production") == "production":
            log.error("Redis not configured — rate limiting is in-memory only (not distributed). Set REDIS_URL or UPSTASH_REDIS_REST_URL/TOKEN.")
        else:
            log.info("Redis not configured — using in-memory rate limiting (dev mode)")
        _redis_available = False
        return None

    try:
        from upstash_redis import Redis
        _redis_client = Redis(url=url, token=token)
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
            pipe = redis.pipeline()
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, window + 1)
            results = pipe.execute()

            current_count = results[1]
            return current_count < max_calls
        except Exception as e:
            log.warning("Redis rate limit check failed: %s — failing closed", e)
            # If Redis is configured but fails, fail closed (deny request)
            return False

    # In-memory fallback (dev mode only)
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