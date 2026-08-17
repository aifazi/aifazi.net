// chat-encryption.js — thin wrapper over @fazi/shared (packages/shared).
// The AES-256-GCM primitives live in the shared package so web + mobile always
// use the same wire format. Web-specific E2EE room-key helpers stay here.
import {
  encryptText as _encryptText,
  decryptText as _decryptText,
  isEncrypted,
  decryptIfEncrypted,
  generateRoomKey,
  ENCRYPTED_PREFIX,
} from '@fazi/shared'

export { isEncrypted, decryptIfEncrypted, generateRoomKey, ENCRYPTED_PREFIX }

// The web chat historically used async encrypt/decrypt (Markdown.jsx and
// MediaPreview.jsx chain `.then()` off decryptText; senders `await` encryptText).
// The shared primitives are synchronous, so wrap them to keep the promise
// contract the existing call sites expect.
export const encryptText = async (plaintext, key) => _encryptText(plaintext, key)
export const decryptText = async (cipher, key) => _decryptText(cipher, key)

let _roomKeyModule = ''
export const _roomKeyCache = {}

export function getRoomKey() { return _roomKeyModule }
export function setRoomKeyModule(key) { _roomKeyModule = key }

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