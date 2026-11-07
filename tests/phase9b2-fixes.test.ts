/// <reference types="vite/client" />
/**
 * Phase 9B2 post-verification regressions (C1, C2, C7).
 *
 * Pure probes: no PostgreSQL and no running API. `fetch` is stubbed so the
 * real proxy/API-client modules are exercised end to end:
 *   - the same-origin contact proxy relays the client IP in `X-Forwarded-For`;
 *   - the API client + data layer surface `details.redirectTo` as a redirect
 *     outcome instead of dropping it into a 404.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { POST, resolveForwardedFor } from '@web/pages/api/contact';
import { getPageDetail } from '@web/data/content';

function withFetch<T>(
  stub: typeof fetch,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

function callProxy(request: Request, clientAddress?: string): Promise<Response> {
  const handler = POST as unknown as (context: {
    request: Request;
    clientAddress?: string;
  }) => Promise<Response>;
  return handler({ request, clientAddress });
}

interface CapturedRequest {
  url: string;
  headers: Headers;
  body: string | null;
}

function captureFetch(response: Response, captured: CapturedRequest[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : null,
    });
    return response;
  }) as typeof fetch;
}

describe('contact proxy forwards the real client IP', () => {
  test('an upstream X-Forwarded-For wins over the socket address', () => {
    const request = new Request('https://web.test/api/contact', {
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    assert.equal(resolveForwardedFor(request, '127.0.0.1'), '203.0.113.9');
  });

  test('falls back to Astro clientAddress when no header is present', () => {
    const request = new Request('https://web.test/api/contact');
    assert.equal(resolveForwardedFor(request, '198.51.100.4'), '198.51.100.4');
    assert.equal(resolveForwardedFor(request), null);
  });

  test('POST relays X-Forwarded-For to the API request', async () => {
    const captured: CapturedRequest[] = [];
    const response = new Response(
      JSON.stringify({ data: { received: true } }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    );

    await withFetch(captureFetch(response, captured), async () => {
      const request = new Request('https://web.test/api/contact', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.20',
        },
        body: JSON.stringify({
          name: 'Ana',
          email: 'ana@uci.test',
          message: 'Hola',
        }),
      });

      const result = await callProxy(request, '127.0.0.1');
      assert.equal(result.status, 201);
    });

    assert.equal(captured.length, 1);
    assert.equal(captured[0]!.headers.get('x-forwarded-for'), '203.0.113.20');
  });
});

describe('page detail propagates the redirect foundation', () => {
  test('a 404 carrying details.redirectTo becomes a redirect outcome', async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'Page not found.',
          details: { redirectTo: '/nosotros' },
        },
      }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    );

    const result = await withFetch(
      (async () => response) as typeof fetch,
      () => getPageDetail('about'),
    );

    assert.deepEqual(result, { status: 'redirect', redirectTo: '/nosotros' });
  });

  test('a plain 404 without details stays not-found', async () => {
    const response = new Response(
      JSON.stringify({
        error: { code: 'NOT_FOUND', message: 'Page not found.' },
      }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    );

    const result = await withFetch(
      (async () => response) as typeof fetch,
      () => getPageDetail('missing'),
    );

    assert.deepEqual(result, { status: 'not-found' });
  });
});
