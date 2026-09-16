/**
 * Certificate pinning for backend API calls.
 * Dual-pin strategy for zero-downtime rotation.
 *
 * To get the current cert pin:
 *   openssl s_client -connect api.nexusstudy.app:443 -servername api.nexusstudy.app </dev/null 2>/dev/null \
 *     | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der \
 *     | openssl dgst -sha256 -binary | base64
 */

// TODO(prod): the pins below are PLACEHOLDERS (AAAA… / BBBB…). Replace them
// with the real SHA256 fingerprints from your production backend BEFORE
// enabling cert pinning in fetch / api.ts. Failure to do so will block ALL
// production traffic to the API the moment pinning is enforced.
export const CERT_PINS = {
  // Current cert (expires 2026-12-01)
  current: {
    sha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    expires: '2026-12-01',
  },
  // Next cert (pre-staged, expires 2027-12-01)
  backup: {
    sha256: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
    expires: '2027-12-01',
  },
};

// Reserved for future use by fetch / api.ts once the pins above are populated
// with real values. Wiring this up will check the leaf cert against the two
// pinned certs and reject connections that don't match.
export function isValidPin(certHash: string): boolean {
  return certHash === CERT_PINS.current.sha256 || certHash === CERT_PINS.backup.sha256;
}

export function getActivePins(): string[] {
  return [CERT_PINS.current.sha256, CERT_PINS.backup.sha256];
}

/**
 * Runtime check for whether a URL's host is one we have pins for.
 * This is a best-effort sanity check; React Native's `fetch` does NOT
 * expose a hook for custom TLS validation, so this function only confirms
 * the host matches our pinned host and returns true/false. Real cert-pinning
 * requires a native module (e.g. react-native-cert-pinner or
 * react-native-ssl-pinning) — see the SECURITY comment in lib/api.ts.
 */
export async function pinCertificateForUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    // Only the production API host is eligible for pinning today.
    // Update this list if you add new pinned hosts.
    const PINNED_HOSTS = new Set(['api.nexusstudy.app']);
    if (!PINNED_HOSTS.has(parsed.hostname)) {
      // Non-pinned host (e.g. localhost in dev). Allow without verification.
      return true;
    }
    // The actual TLS verification must be done by a native module. Until one
    // is installed, this returns true after the host check so the request
    // path is unchanged. DO NOT treat a `true` return as evidence that the
    // cert chain is valid.
    return true;
  } catch {
    return false;
  }
}
