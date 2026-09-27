import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import type { OverlayApi } from '@/src/components/overlay'

export interface PickedFile {
  uri: string
  name: string
  mimeType: string
  size?: number
}

// Mirrors the backend /documents allow-list (routers/documents.py).
export const DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
]

const MIME_FALLBACK: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
}

function mimeFromName(name: string, fallback: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_FALLBACK[ext] ?? fallback
}

export interface PickOptions {
  allowsEditing?: boolean
  aspect?: [number, number]
  /**
   * Reject picks larger than this with an overlay alert. No
   * expo-image-manipulator in package.json, so no client-side
   * compress/downscale — oversize picks are rejected with an error instead.
   */
  maxBytes?: number
}

// Client-side caps mirror the backend limits (routers/upload.py chat 10 MB,
// routers/auth.py avatar 5 MB, routers/documents.py 20 MB) so oversize files
// fail fast with a readable message instead of a 413 after upload.
export const CHAT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024

/**
 * Max-bytes check with a user-facing error. Returns true when the file may
 * proceed. Unknown sizes pass (the backend 413 is the backstop).
 */
export function checkPickedFileSize(file: PickedFile, maxBytes: number, overlay?: OverlayApi): boolean {
  if (typeof file.size === 'number' && file.size > maxBytes) {
    overlay?.alert({
      message: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${maxBytes / 1024 / 1024} MB. Pick a smaller file.`,
    })
    return false
  }
  return true
}

export async function pickLibraryImage(opts: PickOptions = {}, overlay?: OverlayApi): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    overlay?.alert({ message: 'Allow access to your photo library to pick images.' })
    return null
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: opts.allowsEditing ?? false,
    aspect: opts.aspect,
    quality: 0.9,
    selectionLimit: 1,
  })
  if (res.canceled || !res.assets?.length) return null
  const a = res.assets[0]
  const file: PickedFile = {
    uri: a.uri,
    name: a.fileName ?? 'photo.jpg',
    mimeType: a.mimeType ?? mimeFromName(a.fileName ?? 'photo.jpg', 'image/jpeg'),
    size: a.fileSize ?? undefined,
  }
  if (opts.maxBytes !== undefined && !checkPickedFileSize(file, opts.maxBytes, overlay)) return null
  return file
}

export async function takeCameraPhoto(opts: PickOptions = {}, overlay?: OverlayApi): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync()
  if (!perm.granted) {
    overlay?.alert({ message: 'Allow access to the camera to take a photo.' })
    return null
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: opts.allowsEditing ?? false,
    aspect: opts.aspect,
    quality: 0.9,
  })
  if (res.canceled || !res.assets?.length) return null
  const a = res.assets[0]
  const file: PickedFile = {
    uri: a.uri,
    name: a.fileName ?? 'camera.jpg',
    mimeType: a.mimeType ?? 'image/jpeg',
    size: a.fileSize ?? undefined,
  }
  if (opts.maxBytes !== undefined && !checkPickedFileSize(file, opts.maxBytes, overlay)) return null
  return file
}

export async function pickDocument(overlay?: OverlayApi, maxBytes?: number): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: DOCUMENT_TYPES,
  })
  if (res.canceled || !res.assets?.length) return null
  const a = res.assets[0]
  const file: PickedFile = {
    uri: a.uri,
    name: a.name,
    mimeType: a.mimeType ?? mimeFromName(a.name, 'application/octet-stream'),
    size: a.size ?? undefined,
  }
  if (maxBytes !== undefined && !checkPickedFileSize(file, maxBytes, overlay)) return null
  return file
}

/**
 * Asks the user via the overlay menu for an image source (camera or library)
 * and returns the picked file, or null if cancelled/denied.
 */
export async function askImageSourceAsync(overlay: OverlayApi, opts: PickOptions = {}): Promise<PickedFile | null> {
  const source = await overlay.menu({
    title: 'Add image',
    options: [
      { value: 'camera', label: '📷 Take photo' },
      { value: 'library', label: '🖼 Photo library' },
    ],
  })
  if (source === 'camera') return takeCameraPhoto(opts, overlay)
  if (source === 'library') return pickLibraryImage(opts, overlay)
  return null
}
