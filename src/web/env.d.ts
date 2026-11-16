/// <reference types="astro/client" />

/**
 * Ambient Astro types for the public site.
 *
 * `cspNonce` is populated by `src/web/middleware.ts` before rendering so
 * layouts/pages can attach it to inline `<script>` elements required by the
 * nonce-based CSP (Phase 12A, docs/11 §29).
 */
declare namespace App {
  interface Locals {
    cspNonce: string;
  }
}
