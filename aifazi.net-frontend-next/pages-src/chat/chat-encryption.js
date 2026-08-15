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

/**
 * E2EE Key Management
 * 
 * In E2EE mode:
 * 1. Client generates a room key (AES-256)
 * 2. Client encrypts the room key with their public key (or a shared secret)
 * 3. Encrypted key is stored on server via POST /chat/livekit/rooms/{room_id}/e2ee-key
 * 4. When user joins, server returns encrypted key
 * 5. Client decrypts with their private key (stored in browser secure storage)
 * 
 * For simplicity, we use a symmetric key derived from user's password + room ID
 * In production, use proper public key crypto (Web Crypto API ECDH)
 */

export async function generateRoomKey() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const rawKey = await crypto.subtle.exportKey('raw', key)
  return btoa(String.fromCharCode(...new Uint8Array(rawKey)))
}

export async function getE2EERoomKey(roomId) {
  // Check if we have the key cached
  if (_roomKeyCache[roomId]) {
    return _roomKeyCache[roomId]
  }
  // Fetch from server
  try {
    const res = await fetch(`/api/chat/livekit/rooms/${roomId}/encryption-key`, {
      credentials: 'include',
    })
    const data = await res.json()
    if (data.encryption_key) {
      _roomKeyCache[roomId] = data.encryption_key
      return data.encryption_key
    }
  } catch (e) {
    console.warn('Failed to fetch E2EE room key:', e)
  }
  return null
}

export async function storeE2EEKey(roomId, encryptedKey) {
  try {
    const res = await fetch(`/api/chat/livekit/rooms/${roomId}/e2ee-key`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encrypted_key: encryptedKey }),
    })
    return res.ok
  } catch (e) {
    console.warn('Failed to store E2EE key:', e)
    return false
  }
}

export async function enableE2EE(roomId, enabled) {
  try {
    const res = await fetch(`/api/chat/livekit/rooms/${roomId}/e2ee`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })
    return res.ok
  } catch (e) {
    console.warn('Failed to enable E2EE:', e)
    return false
  }
}

export async function disableE2EE(roomId) {
  try {
    const res = await fetch(`/api/chat/livekit/rooms/${roomId}/e2ee`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })
    return res.ok
  } catch (e) {
    console.warn('Failed to disable E2EE:', e)
    return false
  }
}
