import { File, Paths } from 'expo-file-system'
import * as IntentLauncher from 'expo-intent-launcher'
import * as Application from 'expo-application'
import Constants from 'expo-constants'

const GITHUB_REPO = 'aifazi/aifazi.net'
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

export interface ReleaseInfo {
  tag: string
  version: string
  apkUrl?: string
  publishedAt?: string
  notes?: string
}

interface GitHubRelease {
  tag_name?: string
  published_at?: string
  body?: string
  assets?: { name?: string; browser_download_url?: string }[]
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
    const res = await fetch(GITHUB_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'aifazi-mobile',
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as GitHubRelease
    if (!data.tag_name) return null
    const apk = (data.assets || []).find((a) => a.name?.toLowerCase().endsWith('.apk'))
    return {
      tag: data.tag_name,
      version: data.tag_name.replace(/^v/i, ''),
      apkUrl: apk?.browser_download_url,
      publishedAt: data.published_at,
      notes: data.body,
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
): Promise<void> {
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

  await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
    data: file.contentUri,
    flags: 0x00000001, // FLAG_GRANT_READ_URI_PERMISSION
  })
}
