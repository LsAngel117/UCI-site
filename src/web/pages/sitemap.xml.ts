/**
 * `/sitemap.xml` — the public site's sitemap (Phase 9B1 correction, docs/10 §9).
 *
 * The dynamic sitemap is owned by the API (Phase 8): it knows every published
 * page, sermon, event and ministry, including detail URLs and editorial
 * canonical overrides. Re-implementing that discovery here would drift, so this
 * route proxies `GET ${API_BASE_URL}/sitemap.xml` and preserves its bytes.
 *
 * Unlike the build-time `@astrojs/sitemap` integration it does not depend on
 * the route table at build time, includes detail URLs, and never emits a
 * conflicting static sitemap. When the API is unreachable we answer 503 (the
 * same honest degradation as the content routes) instead of serving an empty
 * sitemap that would silently drop the whole site from discovery.
 */
import type { APIRoute } from 'astro';
import { getApiBaseUrl, getApiTimeoutMs } from '../lib/api';

const XML_CONTENT_TYPE = 'application/xml; charset=utf-8';

function unavailable(): Response {
  return new Response('Sitemap temporarily unavailable.\n', {
    status: 503,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'retry-after': '300',
    },
  });
}

export const GET: APIRoute = async () => {
  const url = `${getApiBaseUrl()}/sitemap.xml`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getApiTimeoutMs());

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/xml' },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(
        `[uci] sitemap upstream responded ${response.status} — answering 503.`,
      );
      return unavailable();
    }

    return new Response(await response.text(), {
      status: 200,
      headers: {
        'content-type': XML_CONTENT_TYPE,
        'cache-control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[uci] sitemap unavailable — answering 503 (${message}).`);
    return unavailable();
  } finally {
    clearTimeout(timer);
  }
};
