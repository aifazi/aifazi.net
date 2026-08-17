// Shared AES-256-GCM chat encryption — single source of truth lives in
// @fazi/shared (packages/shared/src/chat-encryption.ts), used by both the
// mobile app and the Next.js web app so the wire format can never drift.
export { ENCRYPTED_PREFIX, encryptText, decryptText, isEncrypted, decryptIfEncrypted } from '@fazi/shared'
