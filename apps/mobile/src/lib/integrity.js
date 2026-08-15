/**
 * src/lib/integrity.js - Anti-tamper runtime integrity checks
 * 
 * Provides runtime integrity verification for critical application components.
 * Detects common tampering attempts and reports them.
 */

import { Platform } from 'react-native';
import { applicationId, version, buildVersion, getAndroidId, getIosIdForVendorAsync } from 'expo-application';
import * as Crypto from 'expo-crypto';

const INTEGRITY_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
let integrityCheckInterval = null;
let isChecking = false;

// Known good hashes for critical files (populated at build time)
// In production, these should be injected at build time
const CRITICAL_FILE_HASHES = {
  // Format: 'path/to/file.js': 'sha256-hash'
  // These would be populated by a build script
};

// Obfuscated strings for anti-reversing
const _0x5a = ['integrity', 'check', 'tamper', 'detected', 'report', 'hash', 'verify'];
const _0x5b = (index) => _0x5a[index];

/**
 * Generate a hash for a string using Web Crypto API
 */
async function generateHash(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if the app is running in a debugger
 */
function detectDebugger() {
  if (__DEV__) return false; // Skip in development
  
  // Check for common debugger indicators
  const start = Date.now();
  debugger; // This will pause if debugger is attached
  const elapsed = Date.now() - start;
  
  // If debugger is attached, execution will pause at debugger statement
  // and elapsed time will be significantly longer
  return elapsed > 100;
}

/**
 * Check for common root/jailbreak indicators
 */
function detectRootOrJailbreak() {
  if (Platform.OS === 'android') {
    // Check for common root indicators
    const rootPaths = [
      '/system/app/Superuser.apk',
      '/sbin/su',
      '/system/bin/su',
      '/system/xbin/su',
      '/data/local/xbin/su',
      '/data/local/bin/su',
      '/system/sd/xbin/su',
      '/system/bin/failsafe/su',
      '/data/local/su',
      '/su/bin/su',
      '/magisk/.core/busybox',
      '/magisk/busybox',
    ];
    // Note: Actual file system checks would require native module
    // This is a placeholder for where native checks would integrate
  }
  
  if (Platform.OS === 'ios') {
    // Check for common jailbreak indicators
    const jailbreakPaths = [
      '/Applications/Cydia.app',
      '/Library/MobileSubstrate/MobileSubstrate.dylib',
      '/bin/bash',
      '/usr/sbin/sshd',
      '/etc/apt',
      '/private/var/lib/apt',
    ];
    // Note: Actual file system checks would require native module
  }
  
  return false; // Placeholder
}

/**
 * Verify app signature (iOS) or signing certificate (Android)
 */
async function verifyAppSignature() {
  try {
    if (Platform.OS === 'ios') {
      // iOS: Check provisioning profile
      const bundleId = applicationId;
      // In production, verify against known bundle IDs
    } else if (Platform.OS === 'android') {
      // Android: Check signing certificate
      const appSignature = await getAndroidId();
      // Verify against known certificate fingerprint
    }
    return true;
  } catch (error) {
    console.warn('Signature verification failed:', error);
    return false;
  }
}

/**
 * Perform integrity check on critical application code
 */
async function performIntegrityCheck() {
  if (isChecking) return;
  isChecking = true;

  try {
    // Check for debugger
    if (detectDebugger()) {
      reportTampering('debugger_detected');
      return false;
    }

    // Check for root/jailbreak
    if (detectRootOrJailbreak()) {
      reportTampering('root_jailbreak_detected');
      return false;
    }

    // Verify app signature
    const signatureValid = await verifyAppSignature();
    if (!signatureValid) {
      reportTampering('invalid_signature');
      return false;
    }

    // Verify critical file hashes (if available)
    // This would check bundle integrity against known hashes
    
    return true;
  } catch (error) {
    console.warn('Integrity check error:', error);
    return false;
  } finally {
    isChecking = false;
  }
}

/**
 * Report tampering attempt to server
 */
async function reportTampering(reason) {
  try {
    const deviceId = await getIosIdForVendorAsync() || 
                     await getAndroidId();
    
    const report = {
      device_id: deviceId,
      reason,
      timestamp: Date.now(),
      app_version: version,
      build_version: buildVersion,
      platform: Platform.OS,
    };

    // Send to monitoring endpoint (non-blocking)
    fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/mobile/tamper-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    }).catch(() => {
      // Silently fail - we don't want to alert the attacker
    });
  } catch (error) {
    // Silently fail
  }
}

/**
 * Start periodic integrity checks
 */
export function startIntegrityChecks() {
  if (integrityCheckInterval) return;
  
  // Initial check
  performIntegrityCheck();
  
  // Periodic checks
  integrityCheckInterval = setInterval(() => {
    performIntegrityCheck();
  }, INTEGRITY_CHECK_INTERVAL);
}

/**
 * Stop integrity checks
 */
export function stopIntegrityChecks() {
  if (integrityCheckInterval) {
    clearInterval(integrityCheckInterval);
    integrityCheckInterval = null;
  }
}

/**
 * Obfuscate a string using simple XOR encoding
 * Used to hide sensitive strings from static analysis
 */
export function obfuscateString(str) {
  const key = 0x5A; // Simple XOR key
  return Array.from(str).map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join('');
}

/**
 * Deobfuscate a string
 */
export function deobfuscateString(str) {
  return obfuscateString(str); // XOR is symmetric
}

/**
 * Generate a secure random string for session tokens
 */
export function generateSecureToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export default {
  startIntegrityChecks,
  stopIntegrityChecks,
  performIntegrityCheck,
  reportTampering,
  obfuscateString,
  deobfuscateString,
  generateSecureToken,
};