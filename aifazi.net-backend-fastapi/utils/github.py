"""utils/github.py — Shared GitHub API client for release + workflow monitoring.

Used by routers/mobile_release.py (public app updater + pipeline status) and
routers/mobile_admin.py (staff release + CI monitoring). All requests happen
server-side so the private-repo token never reaches the browser.

Configure via GITHUB_REPO (owner/repo) and GITHUB_TOKEN (fine-grained PAT with
Contents:Read; Actions:Read needed for workflow-run monitoring).
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

log = logging.getLogger("github")

GITHUB_REPO = os.getenv("GITHUB_REPO", "aifazi/aifazi.net").strip("/")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
GITHUB_API = "https://api.github.com"

TIMEOUT = httpx.Timeout(60.0, connect=10.0)


def headers(accept: str = "application/vnd.github+json") -> dict:
    h = {
        "Accept": accept,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "aifazi-backend",
    }
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


async def gh_get_json(
    client: httpx.AsyncClient,
    path: str,
    params: dict | None = None,
) -> tuple[int, Any]:
    """GET a GitHub API path; returns (status_code, parsed_json_or_None)."""
    url = f"{GITHUB_API}{path}" if path.startswith("/") else f"{GITHUB_API}/{path}"
    resp = await client.get(url, headers=headers(), params=params)
    try:
        data = resp.json()
    except Exception:
        data = None
    return resp.status_code, data


async def get_latest_release(client: httpx.AsyncClient) -> tuple[dict | None, int | None]:
    """Latest release dict. Returns (None, None) on 404 (no releases yet),
    (release, None) on success, (None, http_status) on any other error."""
    status, data = await gh_get_json(client, f"/repos/{GITHUB_REPO}/releases/latest")
    if status == 404:
        return None, None
    if status != 200:
        log.warning("GitHub releases/latest -> %s", status)
        return None, status
    return data, None


def apk_asset(release: dict) -> dict | None:
    for asset in release.get("assets") or []:
        if (asset.get("name") or "").lower().endswith(".apk"):
            return asset
    return None


def asset_sha256(asset: dict) -> str | None:
    """GitHub returns the asset's own SHA-256 under `digest` (``sha256:...``)."""
    digest = (asset.get("digest") or "").strip()
    if digest.lower().startswith("sha256:"):
        return digest.split(":", 1)[1].strip().lower()
    return None