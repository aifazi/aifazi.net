import { ENCRYPTED_PREFIX } from './chat-constants'

let _roomKeyModule = ''
export const _roomKeyCache = {}

export function getRoomKey() { return _roomKeyModule }
export function setRoomKeyModule(key) { _roomKeyModule = key }

export async function encryptText(plaintext, keyBase64) {
  if (!keyBase64 || !plaintext) return plaintext
  try {
    const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(plaintext)
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
    const combined = new Uint8Array(iv.length + ciphertext.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(ciphertext), iv.length)
    return btoa(String.fromCharCode(...combined))
  } catch { return plaintext }
}

export async function decryptText(cipherBase64, keyBase64) {
  if (!keyBase64 || !cipherBase64) return cipherBase64
  try {
    const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt'])
    const combined = Uint8Array.from(atob(cipherBase64), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return new TextDecoder().decode(decrypted)
  } catch { return cipherBase64 }
}

export function isEncrypted(text) {
  return typeof text === 'string' && text.startsWith(ENCRYPTED_PREFIX)
}
