"""routers/mobile_admin.py — staff monitoring for the mobile app delivery pipeline.

Surfaces GitHub release history + CI workflow runs (auto-release, OTA update,
release build) so the admin Monitoring panel can watch the whole Android app
delivery flow. Reads are cached in-memory for 60s to stay inside GitHub's rate
limits (every admin poll does NOT hit api.github.com).

  - GET /api/admin/mobile/releases       -> released versions + assets
  - GET /api/admin/mobile/workflow-runs  -> recent status of the 3 pipelines
"""
from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException

from dependencies import require_staff
from utils.cache import get as cache_get
from utils.cache import set as cache_set
from utils.github import GITHUB_REPO, TIMEOUT, asset_sha256, gh_get_json

log = logging.getLogger("mobile_admin")

router = APIRouter()

WORKFLOWS = [
    ("mobile-auto-release.yml", "Auto-Release"),
    ("mobile-ota-update.yml", "OTA Update"),
    ("mobile-release-build.yml", "Release Build"),
]

CACHE_TTL = 60


@router.get("/releases")
async def mobile_admin_releases(user: dict = Depends(require_staff)) -> dict:
    cached = cache_get("admin:mobile:releases")
    if cached is not None:
        return cached
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        status, data = await gh_get_json(client, f"/repos/{GITHUB_REPO}/releases", params={"per_page": 10})
    if status != 200:
        raise HTTPException(status_code=502, detail="Could not reach GitHub releases API")
    releases = [
        {
            "tag": r.get("tag_name") or "",
            "version": (r.get("tag_name") or "").lstrip("v"),
            "published_at": r.get("published_at"),
            "notes": r.get("body"),
            "latest": i == 0,
            "assets": [
                {
                    "name": a.get("name"),
                    "size": a.get("size"),
                    "sha256": asset_sha256(a),
                    "download_count": a.get("download_count"),
                }
                for a in (r.get("assets") or [])
            ],
        }
        for i, r in enumerate(data or [])
    ]
    payload = {"ok": True, "releases": releases}
    cache_set("admin:mobile:releases", payload, CACHE_TTL)
    return payload


@router.get("/workflow-runs")
async def mobile_admin_workflow_runs(user: dict = Depends(require_staff)) -> dict:
    cached = cache_get("admin:mobile:workflow")
    if cached is not None:
        return cached
    results, actions_read = [], True
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        for file, label in WORKFLOWS:
            status, data = await gh_get_json(
                client,
                f"/repos/{GITHUB_REPO}/actions/workflows/{file}/runs",
                params={"branch": "main", "per_page": 5},
            )
            if status != 200:
                if status in (403, 404):
                    actions_read = False
                results.append({"file": file, "label": label, "ok": False, "runs": []})
                continue
            results.append({
                "file": file,
                "label": label,
                "ok": True,
                "runs": [
                    {
                        "run_number": r.get("run_number"),
                        "head_sha": r.get("head_sha"),
                        "status": r.get("status"),
                        "conclusion": r.get("conclusion"),
                        "event": r.get("event"),
                        "created_at": r.get("created_at"),
                        "updated_at": r.get("updated_at"),
                        "title": r.get("display_title"),
                    }
                    for r in ((data or {}).get("workflow_runs") or [])
                ],
            })
    payload = {"ok": actions_read, "workflows": results}
    cache_set("admin:mobile:workflow", payload, CACHE_TTL)
    return payload