/**
 * `.env` loading for local development (docs/14 §24, §26).
 *
 * Prisma's CLI auto-loads `.env`, but the *runtime* `@prisma/client` does not.
 * Node 24 exposes `process.loadEnvFile()` natively, so we avoid adding a
 * `dotenv` dependency. This helper is idempotent and safe to call from any
 * module; in production the platform injects real environment variables and
 * the missing-file case is a no-op.
 */
export function loadEnvFile(path = '.env'): void {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    // `.env` is optional: ignore ENOENT (production uses the platform env);
    // rethrow anything unexpected so a misconfigured local env is visible.
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }
}
