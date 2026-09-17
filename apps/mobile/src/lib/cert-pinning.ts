/**
 * Certificate pinning configuration for aifazi mobile app.
 *
 * Pin the CA certificate (Let's Encrypt R3) rather than leaf certs to survive
 * automatic certificate renewals. Add SHA-256 hashes of the full CA chain.
 *
 * Usage: Import and apply in your API client setup.
 * The hashes below are examples — replace with actual cert hashes from:
 *   openssl s_client -connect api.aifazi.net:443 < /dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256
 */
export const CERT_PINS = {
  'api.aifazi.net': {
    pins: [
      // Let's Encrypt R3 (ISRG Root X2) — update after cert rotation
      'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    ],
    minVersion: 'TLSv1.2',
  },
  'aifazi.net': {
    pins: [
      'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    ],
    minVersion: 'TLSv1.2',
  },
  'cdn.aifazi.net': {
    pins: [
      'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    ],
    minVersion: 'TLSv1.2',
  },
} as const;

/**
 * Validate a certificate chain against pinned hashes.
 * Returns true if valid, false if pin validation fails.
 */
export function validateCertificatePin(
  hostname: string,
  certificateChain: string[]
): boolean {
  const config = CERT_PINS[hostname as keyof typeof CERT_PINS];
  if (!config) return true; // No pins configured — allow

  const pins = config.pins.map(p => p.replace('sha256/', ''));
  return certificateChain.some(cert => pins.includes(cert));
}
