import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { API_BASE } from './getApiBase'

/**
 * Release info + update checks. The APK sideload path is DISABLED (see below);
 * over-the-air updates flow through EAS Updates (wired in app/_layout.tsx).
 * This module keeps the version-check helpers so the UI can report the latest
 * release state without ever downloading or installing a binary.
 */

/**
 * The self-updater sideload path (download APK + INSTALL_PACKAGE intent) is
 * disabled. Rationale: it trusted the binary on SHA-256 hash alone, and a
 * signer-digest check before install is not feasible with the installed deps —
 * expo-application exposes applicationId/version only, with no Android signing
 * certificate digest API, and no new dependencies are allowed. Hash-only trust
 * lets a MITM/compromised backend ship an arbitrary APK that Android would
 * install under our package identity. Never request REQUEST_INSTALL_PACKAGES;
 * the permission is removed from app.json. Updates ship via EAS Updates.
 */
export class SideloadDisabledError extends Error {
  constructor() {
    super('APK sideload is disabled. Updates are delivered via EAS Updates.')
    this.name = 'SideloadDisabledError'
  }
}

// Kept for import compatibility; the sideload path is disabled.
export class InstallBlockedError extends Error {
  constructor() {
    super('Install was blocked by Android. Allow aifazi to install apps, then press retry.')
    this.name = 'InstallBlockedError'
  }
}

/** Deprecated stub: sideload disabled, never requests install permission. */
export async function canRequestPackageInstalls(): Promise<boolean> {
  return false
}

const RELEASE_API = `${API_BASE}/api/mobile/release/latest`

/** Pipeline state for the latest release, mirroring the backend `/status` contract. */
export type ReleaseState = 'ready' | 'building' | 'none'

export interface ReleaseInfo {
  tag?: string
  version?: string
  state?: ReleaseState
  apkUrl?: string
  apkSize?: number
  sha256?: string
  publishedAt?: string
  notes?: string
}

interface BackendRelease {
  tag?: string
  version?: string
  state?: ReleaseState
  apk_url?: string
  asset_size?: number
  sha256?: string
  published_at?: string
  notes?: string
  asset_name?: string
}

export function getInstalledVersion(): string {
  return (
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    '0.0.0'
  )
}

function parseVersion(v: string): number[] {
  return (v || '')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10))
    .filter((n) => !Number.isNaN(n))
}

/** Returns >0 if a > b, <0 if a < b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x - y
  }
  return 0
}

/**
 * Fetch the latest release from the backend. Throws on network failure, backend
 * errors, or timeout so callers can surface "could not check" instead of
 * silently claiming the app is up to date. A release that exists but whose APK
 * is still uploading comes back with `state: 'building'` (200), and no release
 * at all comes back with `state: 'none'` — both are normal states, not errors.
 */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(RELEASE_API, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'aifazi-mobile',
      },
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`Release endpoint replied ${res.status}`)
    }
    const data = (await res.json()) as BackendRelease
    if (!data.tag || data.state === 'none') return null
    return {
      tag: data.tag,
      version: data.version || data.tag.replace(/^v/i, ''),
      state: data.state ?? (data.apk_url ? 'ready' : 'building'),
      apkUrl: data.apk_url,
      apkSize: data.asset_size,
      sha256: data.sha256,
      publishedAt: data.published_at,
      notes: data.notes,
    }
  } finally {
    clearTimeout(timer)
  }
}

export interface UpdateCheck {
  installed: string
  latest: string
  updateAvailable: boolean
  /** Pipeline state of the fetched release: ready, building, or none. */
  state?: ReleaseState
  release?: ReleaseInfo
}

export async function checkForUpdate(): Promise<UpdateCheck> {
  const installed = getInstalledVersion()
  const release = await fetchLatestRelease()
  if (!release) {
    return { installed, latest: installed, updateAvailable: false, state: 'none' }
  }
  const version = release.version || installed
  return {
    installed,
    latest: version,
    updateAvailable: release.state === 'ready' && compareVersions(version, installed) > 0,
    state: release.state,
    release,
  }
}

export interface InstallProgress {
  bytesWritten: number
  totalBytes: number
  fraction: number
}

/**
 * DISABLED. Previously downloaded the release APK (SHA-256 checked) and fired
 * the package-installer intent. Removed: hash-only trust cannot authenticate
 * the publisher, and no installed dep can read the APK/release signing
 * certificate digest to verify it. Always throws SideloadDisabledError.
 */
export async function downloadAndInstall(
  _apkUrl: string,
  _onProgress?: (p: InstallProgress) => void,
  _expectedSize?: number,
  _expectedSha256?: string,
): Promise<void> {
  throw new SideloadDisabledError()
}

/**
 * Deprecated no-op (sideload disabled). Kept so existing imports typecheck;
 * does nothing and never launches a settings intent.
 */
export async function openInstallSettings(): Promise<void> {
  return
}
