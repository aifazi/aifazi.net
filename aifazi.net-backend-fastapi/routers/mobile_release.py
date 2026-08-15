"""
routers/mobile_release.py — public release metadata + APK download for the mobile app.

The mobile app's in-app updater needs to know the latest Android release and
download the APK. The GitHub repo is private, so the app cannot query
api.github.com directly (anonymous requests 404). This router proxies the
operations server-side:

  - GET  /api/mobile/release/latest  -> JSON { state: ready|building|none, tag, version, apk_url, ... }
  - GET  /api/mobile/status          -> JSON { state: ready|building|none, ... }
  - GET  /api/mobile/release/download -> streams the latest APK asset bytes

`state` tells the mobile app what to show. The auto-release tag is created
immediately, but the CI build (local Gradle `assembleRelease` on GitHub
Actions) uploads the APK a while later, so `building` (not an error) is
returned in that window. `/release/latest` returns 200 with `state` instead of a
bare 404 so the in-app updater never has to guess between "no release", "still
building", and "backend broken".

Use GITHUB_TOKEN (a fine-grained PAT with Contents:Read, or a classic PAT with
`repo` scope) so the server can read the private repo. When the token is missing
the endpoints fall back to the public repo path (useful in local/dev where the
repo may be public).
"""
from __future__ import annotations

import logging
import os

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse, Response, StreamingResponse

from utils.github import (
    GITHUB_API,
    GITHUB_REPO,
    TIMEOUT,
    apk_asset,
    asset_sha256,
    get_latest_release,
    headers,
)

log = logging.getLogger("mobile_release")

router = APIRouter()

API_URL = os.getenv("API_URL", "https://api.aifazi.net").rstrip("/")


@router.get("/release/latest")
async def mobile_release_latest() -> dict:
    """Latest release metadata for the in-app updater.

    Returns 200 with `state` (ready|building|none) instead of a bare 404 so the
    mobile app can distinguish "no release yet", "release is still building",
    and "backend cannot reach GitHub" (the latter stays a 502).
    """
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        release, err = await get_latest_release(client)
    if err:
        log.warning("GitHub releases/latest -> %s", err)
        raise HTTPException(status_code=502, detail="Could not reach GitHub release API")
    if not release:
        return {
            "state": "none",
            "tag": None,
            "version": None,
            "published_at": None,
            "notes": None,
            "apk_url": None,
            "asset_name": None,
            "asset_size": None,
            "sha256": None,
        }
    tag = (release.get("tag_name") or "").strip()
    base = {
        "tag": tag,
        "version": tag.lstrip("v"),
        "published_at": release.get("published_at"),
        "notes": release.get("body"),
    }
    asset = apk_asset(release)
    if not asset:
        return {**base, "state": "building", "apk_url": None, "asset_name": None, "asset_size": None, "sha256": None}
    return {
        **base,
        "state": "ready",
        "apk_url": f"{API_URL}/api/mobile/release/download",
        "asset_name": asset.get("name"),
        "asset_size": asset.get("size"),
        "sha256": asset_sha256(asset),
    }


@router.get("/status")
async def mobile_release_status() -> dict:
    """Public pipeline status used by the web /app page.

    The auto-release tag is created immediately; the CI build (local Gradle
    `assembleRelease` on GitHub Actions) uploads the APK a while later.
    `state` tells consumers the download is *ready* once the APK appears, or
    *building* while it is not yet uploaded.
    """
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        release, err = await get_latest_release(client)
    if err:
        raise HTTPException(status_code=502, detail="Could not reach GitHub release API")
    if not release:
        return {"state": "none", "tag": None, "version": None, "published_at": None, "notes": None}
    tag = (release.get("tag_name") or "").strip()
    base = {
        "tag": tag,
        "version": tag.lstrip("v"),
        "published_at": release.get("published_at"),
        "notes": release.get("body"),
    }
    asset = apk_asset(release)
    if not asset:
        return {**base, "state": "building"}
    return {
        **base,
        "state": "ready",
        "apk_url": f"{API_URL}/api/mobile/release/download",
        "asset_name": asset.get("name"),
        "asset_size": asset.get("size"),
        "sha256": asset_sha256(asset),
    }


@router.get("/release/download")
async def mobile_release_download() -> Response:
    """Redirect the client to GitHub's signed CDN URL for the latest APK.

    The private-repo asset must be fetched through the API endpoint, which
    302-redirects to a pre-signed CDN URL (browser_download_url 404s without
    auth). We capture that URL server-side and 307-redirect the client to it,
    so the 150MB APK streams from GitHub's CDN instead of proxying through us.
    """
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
        release, err = await get_latest_release(client)
        if err:
            raise HTTPException(status_code=502, detail="Could not reach GitHub release API")
        if not release:
            raise HTTPException(status_code=404, detail="No release found for this app")
        asset = apk_asset(release)
        if not asset or not asset.get("id"):
            raise HTTPException(status_code=404, detail="No APK attached to the latest release")
        asset_id = asset["id"]

        url = f"{GITHUB_API}/repos/{GITHUB_REPO}/releases/assets/{asset_id}"
        h = headers(accept="application/octet-stream")

        resp = await client.get(url, headers=h)
        if resp.status_code == 302:
            location = resp.headers.get("location")
            if location:
                return RedirectResponse(location, status_code=307)
            raise HTTPException(status_code=502, detail="GitHub did not provide a download URL")
        if resp.status_code != 200:
            log.warning("GitHub asset download -> %s", resp.status_code)
            raise HTTPException(status_code=502, detail="Could not reach GitHub CDN")

        # Older tokenless flows may get the body directly; stream it.
        body = resp.content

        async def _stream():
            for chunk in _chunks(body):
                yield chunk

        return StreamingResponse(_stream(), media_type="application/vnd.android.package-archive", headers={"Content-Type": "application/vnd.android.package-archive"})


def _chunks(data: bytes, size: int = 64 * 1024):
    for i in range(0, len(data), size):
        yield data[i:i + size]