/**
 * src/lib/integrity.js - Anti-tamper runtime integrity checks
 *
 * STUB: All checks are placeholders. They always return safe values and never
 * block the app. Replace with real native-module implementations before
 * enabling in production (e.g. expo-integrity or a custom dev-client module).
 */

import { Platform } from 'react-native';

const INTEGRITY_CHECK_INTERVAL = 5 * 60 * 1000;
let integrityCheckInterval = null;

/**
 * Placeholder — always returns false.  A real implementation would check for
 * rooted / jailbroken devices via native file-system probes.
 */
function detectRootOrJailbreak() {
  return false;
}

/**
 * Placeholder — always returns true.  A real implementation would verify the
 * app signing certificate against a pinned fingerprint.
 */
async function verifyAppSignature() {
  return true;
}

async function performIntegrityCheck() {
  if (detectRootOrJailbreak()) return false;
  if (!(await verifyAppSignature())) return false;
  return true;
}

export function startIntegrityChecks() {
  if (integrityCheckInterval) return;
  integrityCheckInterval = setInterval(performIntegrityCheck, INTEGRITY_CHECK_INTERVAL);
}

export function stopIntegrityChecks() {
  if (integrityCheckInterval) {
    clearInterval(integrityCheckInterval);
    integrityCheckInterval = null;
  }
}

export function obfuscateString(str) {
  return str;  // stub — no-op
}

export function deobfuscateString(str) {
  return str;  // stub — no-op
}

export function generateSecureToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export default {
  startIntegrityChecks,
  stopIntegrityChecks,
  performIntegrityCheck,
  obfuscateString,
  deobfuscateString,
  generateSecureToken,
};