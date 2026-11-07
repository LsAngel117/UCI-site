/**
 * Astro SSR security handler (Phase 12A, docs/11 §28–§30).
 *
 * Kept free of `astro:` virtual imports so it can be unit-tested with plain
 * `node:test`; `src/web/middleware.ts` is the thin Astro binding. For every
 * request it mints a CSP nonce before rendering (consumed by the layout and the
 * contact form's inline script) and stamps the shared security-header policy
 * onto the response. HSTS is only emitted over HTTPS or in production.
 */
import type { MiddlewareHandler } from 'astro';
import {
  applySecurityHeaders,
  generateNonce,
  shouldSendHsts,
} from '@shared/security';

/** Locals this handler populates before the page renders. */
interface SecurityLocals {
  cspNonce: string;
}

export const handleSecurity: MiddlewareHandler = async (context, next) => {
  // The nonce must exist before rendering so `<script nonce={…}>` matches the
  // `script-src` directive emitted after `next()` resolves.
  const nonce = generateNonce();
  (context.locals as unknown as SecurityLocals).cspNonce = nonce;

  const response = await next();

  return applySecurityHeaders(response, {
    secure: shouldSendHsts(context.url.protocol, process.env.NODE_ENV ?? ''),
    nonce,
  });
};
