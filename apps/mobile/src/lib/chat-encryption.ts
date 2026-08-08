import { gcm } from '@noble/ciphers/aes.js'
import { randomBytes } from '@noble/ciphers/utils.js'

export const ENCRYPTED_PREFIX = 'ENC:'

const IV_LENGTH = 12

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
