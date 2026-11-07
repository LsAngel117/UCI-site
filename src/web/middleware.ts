/**
 * Astro SSR middleware entry point (Phase 12A, docs/11 §28–§30).
 *
 * Astro discovers this file in `srcDir` (`src/web`) and runs it for every page
 * and API route. The logic lives in `./lib/security` so it stays unit-testable
 * without Astro's virtual modules.
 */
import { defineMiddleware } from 'astro:middleware';
import { handleSecurity } from './lib/security';

export const onRequest = defineMiddleware(handleSecurity);
