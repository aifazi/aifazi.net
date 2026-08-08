import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'

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
}

export async function pickLibraryImage(opts: PickOptions = {}): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('Permission required', 'Allow access to your photo library to pick images.')
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
  return {
    uri: a.uri,
    name: a.fileName ?? 'photo.jpg',
    mimeType: a.mimeType ?? mimeFromName(a.fileName ?? 'photo.jpg', 'image/jpeg'),
    size: a.fileSize ?? undefined,
  }
}

export async function takeCameraPhoto(opts: PickOptions = {}): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('Permission required', 'Allow access to the camera to take a photo.')
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
  return {
    uri: a.uri,
    name: a.fileName ?? 'camera.jpg',
    mimeType: a.mimeType ?? 'image/jpeg',
    size: a.fileSize ?? undefined,
  }
}

export async function pickDocument(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: DOCUMENT_TYPES,
  })
  if (res.canceled || !res.assets?.length) return null
  const a = res.assets[0]
  return {
    uri: a.uri,
    name: a.name,
    mimeType: a.mimeType ?? mimeFromName(a.name, 'application/octet-stream'),
    size: a.size ?? undefined,
  }
}

/**
 * Prompts the user for an image source (camera or library) and returns the
 * picked file, or null if cancelled/denied.
 */
export function askImageSource(onFile: (f: PickedFile) => void): void {
  Alert.alert('Add image', 'Choose a source', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Take photo', onPress: () => takeCameraPhoto().then((f) => f && onFile(f)) },
    { text: 'Photo library', onPress: () => pickLibraryImage().then((f) => f && onFile(f)) },
  ])
}
