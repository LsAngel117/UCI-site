/**
 * Password hashing (docs/11 §5.3).
 *
 * Passwords are stored with **Argon2id**, the algorithm the security spec
 * prefers for a modern adaptive KDF. We use `@node-rs/argon2` (precompiled
 * native bindings, no node-gyp) instead of `argon2` to keep installs
 * reproducible.
 *
 * Parameters are OWASP-recommended for Argon2id and are deliberately explicit
 * rather than library defaults, so a future dependency change cannot silently
 * weaken hashing:
 *   - algorithm:   Argon2id — hybrid resistant to both GPU and side-channel
 *                  attacks (the salt-independent default of the Rust crate).
 *   - memoryCost:  19 MiB (19456 KiB) — per hash, per thread.
 *   - timeCost:    2 passes/iterations.
 *   - parallelism: 1 lane.
 *   - outputLen:   32-byte raw digest (43-char PHC string).
 *
 * The PHC-encoded hash embeds the salt and parameters, so verification needs
 * only the stored string. Password hashes must never be returned by the API
 * (docs/11 §5.3) — this module is server-only.
 */
import { hash, verify, type Algorithm, type Options } from '@node-rs/argon2';

export const ARGON2_PARAMETERS: Options = {
  // 2 is `Algorithm.Argon2id`; referenced numerically because the library
  // ships it as an ambient `const enum`, which `isolatedModules` forbids
  // accessing as a value. The runtime-verified PHC prefix is `$argon2id$`.
  algorithm: 2 as Algorithm,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

/**
 * Hash a plaintext password into a PHC-encoded Argon2id string.
 *
 * The caller must never log, store plainly or return the input or the result
 * to a client.
 */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_PARAMETERS);
}

/**
 * Verify a plaintext password against a stored Argon2id hash.
 *
 * Returns `false` (never throws) for a malformed/foreign hash so a corrupted
 * record degrades to "wrong password" instead of a 500 that could reveal
 * internal state (docs/11 §36). Always performs the comparison in constant
 * time internally via the native verifier.
 */
export async function verifyPassword(
  storedHash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}