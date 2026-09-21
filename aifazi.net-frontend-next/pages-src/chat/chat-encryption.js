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
 * 3. Encrypted key is stored on server via POST /chat/rooms/{room_id}/e2ee-key
 * 4. When user joins, server returns encrypted key
 * 5. Client decrypts with their private key (stored in browser secure storage)
 *
 * For simplicity, we use a symmetric key derived from user's password + room ID
 * In production, use proper public key crypto (Web Crypto API ECDH)
 */

export async function getE2EERoomKey(roomId) {
  // DEPRECATED: LiveKit E2EE has been removed. Returns null.
  return null
}

export async function storeE2EEKey(roomId, encryptedKey) {
  // DEPRECATED: LiveKit E2EE has been removed. No-op.
  return true
}

export async function enableE2EE(roomId, enabled) {
  // DEPRECATED: LiveKit E2EE has been removed. No-op.
  return true
}

export async function disableE2EE(roomId) {
  // DEPRECATED: LiveKit E2EE has been removed. No-op.
  return true
}