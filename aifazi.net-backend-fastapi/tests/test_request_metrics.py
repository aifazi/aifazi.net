"""Tests for utils/request_metrics.py (413/429/500-by-route counters)."""
import os
import sys
import time

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from utils import request_metrics as rm


def setup_function():
    rm._events.clear()


def test_tracks_only_413_429_500():
    rm.record_error("/api/x", 404)
    rm.record_error("/api/x", 401)
    rm.record_error("/api/x", 413)
    rm.record_error("/api/y", 429)
    rm.record_error("/api/y", 429)
    rm.record_error("/api/z", 500)
    snap = {(e["route"], e["status"]): e["count"] for e in rm.snapshot()}
    assert ("/api/x", 413) in snap
    assert snap[("/api/y", 429)] == 2
    assert snap[("/api/z", 500)] == 1
    assert ("/api/x", 404) not in snap
    assert ("/api/x", 401) not in snap


def test_prunes_events_older_than_24h():
    rm.record_error("/api/x", 500)
    rm._events[("/api/x", 500)][0] = time.time() - rm._WINDOW_S - 5
    assert rm.snapshot() == []
    assert ("/api/x", 500) not in rm._events  # empty series dropped


def test_path_truncated_to_max():
    rm.record_error("/" + "a" * 500, 429)
    snap = rm.snapshot()
    assert len(snap[0]["route"]) == 120


def test_key_cap_bounds_cardinality():
    for i in range(rm._MAX_KEYS + 50):
        rm.record_error(f"/unique/route/{i}", 429)
    assert len(rm._events) <= rm._MAX_KEYS


def test_snapshot_sorted_by_count_desc_and_capped_at_25():
    rm.record_error("/common", 429)
    rm.record_error("/common", 429)
    rm.record_error("/rare", 500)
    snap = rm.snapshot()
    assert snap[0]["route"] == "/common"
    assert snap[0]["count"] == 2
    for i in range(40):
        rm.record_error(f"/bulk/{i}", 429)
    assert len(rm.snapshot()) <= 25
