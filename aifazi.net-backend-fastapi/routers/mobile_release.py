"""
routers/mobile_release.py — public release metadata + APK download for the mobile app.

The mobile app's in-app updater needs to know the latest Android release and
download the APK. The GitHub repo is private, so the app cannot query
api.github.com directly (anonymous requests 404). This router proxies the two
operations server-side:

  - GET  /api/mobile/release/latest   -> JSON { tag, version, apk_url, published_at, notes }
  - GET  /api/mobile/release/download -> streams the latest APK asset bytes

Use GITHUB_TOKEN (a fine-grained PAT with Contents:Read on aifazi/aifazi.net, or
a classic PAT with `repo` scope) so the server can read the private repo. When
the token is missing the endpoints fall back to the public repo path (useful in
local/dev where the repo may be public).
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse

log = logging.getLogger("mobile_release")

router = APIRouter()

GITHUB_REPO = os.getenv("GITHUB_REPO", "aifazi/aifazi.net")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
GITHUB_API = "https://api.github.com"

TIMEOUT = httpx.Timeout(60.0, connect=10.0)


def _headers() -> dict:
    h = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "aifazi-backend",
    }
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


async def _latest_release_json(client: httpx.AsyncClient) -> dict:
    url = f"{GITHUB_API}/repos/{GITHUB_REPO}/releases/latest"
    resp = await client.get(url, headers=_headers())
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="No release found for this app")
    if resp.status_code != 200:
        log.warning("GitHub releases/latest -> %s %s", resp.status_code, resp.text[:200])
        raise HTTPException(status_code=502, detail="Could not reach GitHub release API")
    return resp.json()


def _apk_asset(release: dict) -> dict:
    for asset in release.get("assets") or []:
        if (asset.get("name") or "").lower().endswith(".apk"):
            return asset
    raise HTTPException(status_code=404, detail="No APK attached to the latest release")


@router.get("/release/latest")
async def mobile_release_latest() -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        release = await _latest_release_json(client)
        asset = _apk_asset(release)
    tag = (release.get("tag_name") or "").strip()
    apk_url = (
        f"{os.getenv('API_URL', 'https://api.aifazi.net').rstrip('/')}"
        f"/api/mobile/release/download"
    )
    return {
        "tag": tag,
        "version": tag.lstrip("v"),
        "apk_url": apk_url,
        "published_at": release.get("published_at"),
        "notes": release.get("body"),
        "asset_name": asset.get("name"),
        "asset_size": asset.get("size"),
    }


@router.get("/release/download")
async def mobile_release_download() -> Response:
    """Stream the latest APK. Proxies the private-repo asset through the server."""
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        release = await _latest_release_json(client)
        asset = _apk_asset(release)
        asset_id = asset.get("id")
        if not asset_id:
            raise HTTPException(status_code=404, detail="APK asset has no id")
        # Private-repo assets must be fetched through the API endpoint, which
        # 302-redirects to a signed CDN URL (browser_download_url 404s without
        # auth). follow_redirects=True follows that redirect chain.
        url = f"{GITHUB_API}/repos/{GITHUB_REPO}/releases/assets/{asset_id}"
        headers = _headers()
        headers["Accept"] = "application/octet-stream"

        upstream = client.build_request("GET", url, headers=headers)
        resp = await client.send(upstream, stream=True)
        if resp.status_code != 200:
            await resp.aclose()
            log.warning("GitHub asset download -> %s", resp.status_code)
            raise HTTPException(status_code=502, detail="Could not download APK from GitHub")

        headers = {"Content-Type": "application/vnd.android.package-archive"}
        if asset.get("size"):
            headers["Content-Length"] = str(asset["size"])

        async def _stream():
            try:
                async for chunk in resp.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk
            finally:
                await resp.aclose()

        return StreamingResponse(
            _stream(),
            headers=headers,
            media_type="application/vnd.android.package-archive",
        )
