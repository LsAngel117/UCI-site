/**
 * URL validation shared by settings surfaces (docs/08 §17, §30).
 *
 * A value is accepted only when it is an absolute http(s) URL with a real
 * host. `new URL()` alone accepts shapes such as `https://` that must never be
 * persisted, so the protocol and hostname are checked explicitly.
 */
export function isHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  return parsed.hostname.length > 0;
}
