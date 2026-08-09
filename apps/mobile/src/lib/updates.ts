import { File, Paths } from 'expo-file-system'
import * as IntentLauncher from 'expo-intent-launcher'
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import * as Crypto from 'expo-crypto'
import { PermissionsAndroid, Platform } from 'react-native'

/**
 * Thrown when Android refuses the install because the app's per-app
 * "Install unknown apps" toggle is off. Android 8+ (and particularly 13/14)
 * resets that toggle for an app after it is updated to a newer versionCode,
 * so the user may *believe* it's on while the installer still blocks us.
 * Callers should route the user to the per-app toggle and retry.
 */
export class InstallBlockedError extends Error {
  constructor() {
    super('Install was blocked by Android. Allow aifazi to install apps, then press retry.')
    this.name = 'InstallBlockedError'
  }
}

/** True when Android's per-app "Install unknown apps" permission is granted. */
export async function canRequestPackageInstalls(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  try {
    // REQUEST_INSTALL_PACKAGES is a special "app op" (not a runtime
    // permission), so it is not in RN's Permission union — cast is expected.
    return await PermissionsAndroid.check('android.permission.REQUEST_INSTALL_PACKAGES' as never)
  } catch {
    return true
  }
}

const RELEASE_API = 'https://api.aifazi.net/api/mobile/release/latest'

export interface ReleaseInfo {
  tag: string
  version: string
  apkUrl?: string
  apkSize?: number
  sha256?: string
  publishedAt?: string
  notes?: string
}

interface BackendRelease {
  tag?: string
  version?: string
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

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(RELEASE_API, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'aifazi-mobile',
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as BackendRelease
    if (!data.tag) return null
    return {
      tag: data.tag,
      version: data.version || data.tag.replace(/^v/i, ''),
      apkUrl: data.apk_url,
      apkSize: data.asset_size,
      sha256: data.sha256,
      publishedAt: data.published_at,
      notes: data.notes,
    }
  } catch {
    return null
  }
}

export interface UpdateCheck {
  installed: string
  latest: string
  updateAvailable: boolean
  release?: ReleaseInfo
}

export async function checkForUpdate(): Promise<UpdateCheck> {
  const installed = getInstalledVersion()
  const release = await fetchLatestRelease()
  if (!release) {
    return { installed, latest: installed, updateAvailable: false }
  }
  return {
    installed,
    latest: release.version,
    updateAvailable: compareVersions(release.version, installed) > 0,
    release,
  }
}

export interface InstallProgress {
  bytesWritten: number
  totalBytes: number
  fraction: number
}

export async function downloadAndInstall(
  apkUrl: string,
  onProgress?: (p: InstallProgress) => void,
  expectedSize?: number,
  expectedSha256?: string,
): Promise<void> {
  // Android 8+: refuse to even start the download when the per-app toggle is
  // off, instead of wasting 150MB and then hitting the installer's block
  // screen. The toggle silently resets on Android 13/14 after the app itself
  // is updated, so trusting the user's previous "I enabled it" is not enough.
  if (!(await canRequestPackageInstalls())) {
    throw new InstallBlockedError()
  }

  const dest = new File(Paths.cache, 'aifazi-update.apk')
  if (dest.exists) dest.delete()

  const task = File.createDownloadTask(apkUrl, dest, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      onProgress?.({
        bytesWritten,
        totalBytes,
        fraction: totalBytes > 0 ? bytesWritten / totalBytes : 0,
      })
    },
  })

  const file = await task.downloadAsync()
  if (!file || !file.exists) {
    throw new Error('Download failed')
  }

  // Guard against a truncated/corrupt download. The backend usually tells us the
  // exact byte size of the APK; if the downloaded file is smaller, surface a
  // clear error instead of handing Android a broken package (which produces the
  // "There was a problem parsing the package" message at install time).
  if (expectedSize && file.size !== expectedSize) {
    dest.delete()
    throw new Error(`Download incomplete (got ${file.size} of ${expectedSize} bytes) — please retry`)
  }

  // Authenticity check: when the backend advertises the release's SHA-256 (taken
  // from the GitHub asset digest), reject any APK that doesn't hash to it. This
  // stops a tampered/mitm'd binary from ever reaching the installer even if the
  // plain size + PK check would have passed.
  if (expectedSha256) {
    try {
      const bytes = await file.bytes()
      const digestBuf = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)
      const digestHex = Array.from(new Uint8Array(digestBuf), (b) => b.toString(16).padStart(2, '0')).join('')
      if (digestHex !== expectedSha256.toLowerCase()) {
        dest.delete()
        throw new Error('Downloaded APK failed its checksum verification — please retry')
      }
    } catch {
      dest.delete()
      throw new Error('Downloaded APK failed its checksum verification — please retry')
    }
  }

  // Sanity: every APK is a ZIP archive, so it must start with "PK\x03\x04".
  // Use a 4-byte slice — reading the whole file defeats the size guard above.
  try {
    const head = await file.slice(0, 4).text()
    if (!head.startsWith('PK')) {
      dest.delete()
      throw new Error('Downloaded file is not a valid APK')
    }
  } catch {
    dest.delete()
    throw new Error('Downloaded file is not a valid APK')
  }

  await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
    data: file.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 0x00000001 | 0x00000040, // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
  })
}

/**
 * Deep-link to the per-app "Install unknown apps" toggle on Android 8+.
 * Once the user flips this ON for aifazi, Android silently allows subsequent
 * installs from this app and drops the "install blocked / unknown source"
 * warning. Opening this screen is the only legitimate code-side step that can
 * reduce that prompt — the OS itself can't be bypassed from JS.
 */
export async function openInstallSettings(): Promise<void> {
  if (Platform.OS !== 'android') return
  const pkg = getApplicationId()
  if (!pkg) return
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
      data: `package:${pkg}`,
    })
  } catch {
    // Fall back to the app details page if the direct toggle isn't available
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, {
        data: `package:${pkg}`,
      })
    } catch {}
  }
}

function getApplicationId(): string | null {
  try {
    return Application.applicationId
  } catch {
    return null
  }
}
