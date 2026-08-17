// chat-encryption.ts — AES-256-GCM message encryption shared by web + mobile.
//
// One implementation, same wire format on both platforms: base64(key) as the
// raw AES-256 key, 12-byte IV prepended to the ciphertext, base64 output. This
// matches the format the mobile app already used with @noble/ciphers and is
// interoperable with the browser WebCrypto format the web app used.
//
// @noble/ciphers is pinned to ^2 (aes.js + utils.js subpaths) so it resolves
// identically under both Metro and Next; the shared package installs its own
// copy when the consuming app pins an older major.

import { gcm } from '@noble/ciphers/aes.js'
import { ENCRYPTED_PREFIX } from './chat-contract'

export { ENCRYPTED_PREFIX }

const IV_LENGTH = 12

// CSPRNG: globalThis.crypto.getRandomValues — available on browsers and on
// Hermes (the mobile app already relies on it via @noble/ciphers). Avoids the
// @noble/ciphers/utils randomBytes subpath, which differs across v1/v2.
function randomBytes(n: number): Uint8Array {
  const c = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => void } }).crypto
  if (c?.getRandomValues) {
    const out = new Uint8Array(n)
    c.getRandomValues(out)
    return out
  }
  throw new Error('crypto.getRandomValues is not available')
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/** Encrypt plaintext with AES-256-GCM. Returns plaintext unchanged on failure. */
export function encryptText(plaintext: string, keyBase64: string): string {
  if (!keyBase64 || !plaintext) return plaintext
  try {
    const key = b64ToBytes(keyBase64)
    const iv = randomBytes(IV_LENGTH)
    const ciphertext = gcm(key, iv).encrypt(new TextEncoder().encode(plaintext))
    const combined = new Uint8Array(IV_LENGTH + ciphertext.length)
    combined.set(iv)
    combined.set(ciphertext, IV_LENGTH)
    return bytesToB64(combined)
  } catch {
    return plaintext
  }
}

/** Decrypt AES-256-GCM. Returns the ciphertext unchanged on failure. */
export function decryptText(cipherBase64: string, keyBase64: string): string {
  if (!keyBase64 || !cipherBase64) return cipherBase64
  try {
    const key = b64ToBytes(keyBase64)
    const combined = b64ToBytes(cipherBase64)
    const iv = combined.slice(0, IV_LENGTH)
    const ciphertext = combined.slice(IV_LENGTH)
    const decrypted = gcm(key, iv).decrypt(ciphertext)
    return new TextDecoder().decode(decrypted)
  } catch {
    return cipherBase64
  }
}

export function isEncrypted(text: string | undefined | null): text is string {
  return typeof text === 'string' && text.startsWith(ENCRYPTED_PREFIX)
}

export function decryptIfEncrypted(text: string | undefined | null, keyBase64: string): string {
  if (!isEncrypted(text)) return text ?? ''
  return decryptText(text.slice(ENCRYPTED_PREFIX.length), keyBase64)
}

/** Generate a fresh AES-256 key (raw bytes, base64) for a room/thread. */
export function generateRoomKey(): string {
  return bytesToB64(randomBytes(32))
}