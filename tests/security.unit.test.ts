/**
 * Phase 12A — security policy primitives (docs/11 §16, §28–§30).
 *
 * Pure unit coverage for the shared header/CSP/CSRF helpers and the Astro SSR
 * handler that applies them. No server or database is required.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  generateNonce,
  isMutatingMethod,
  isSameOriginRequest,
  shouldSendHsts,
} from '@shared/security';
import { handleSecurity } from '@web/lib/security';

const BASE_CONTEXT = {
  locals: {} as Record<string, unknown>,
  url: new URL('https://uci.test/nosotros'),
};

async function runAstroMiddleware(
  context: { locals: Record<string, unknown>; url: URL },
): Promise<Response> {
  const handler = handleSecurity as unknown as (
    context: unknown,
    next: () => Promise<Response>,
  ) => Promise<Response>;
  return handler(context, async () =>
    new Response('<html>ok</html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  );
}

function cspDirective(policy: string, name: string): string | null {
  for (const part of policy.split(';')) {
    const [directive, ...sources] = part.trim().split(/\s+/);
    if (directive === name) return sources.join(' ');
  }
  return null;
}

describe('security headers', () => {
  test('includes the baseline hardening headers on every response', () => {
    const headers = buildSecurityHeaders({ secure: false });
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.equal(
      headers['Referrer-Policy'],
      'strict-origin-when-cross-origin',
    );
    assert.match(headers['Permissions-Policy'] ?? '', /camera=\(\)/);
    assert.match(headers['Permissions-Policy'] ?? '', /geolocation=\(\)/);
    assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin');
    assert.ok(headers['Content-Security-Policy']);
  });

  test('omits HSTS by default and includes it when secure', () => {
    assert.equal(
      buildSecurityHeaders({ secure: false })['Strict-Transport-Security'],
      undefined,
    );
    assert.match(
      buildSecurityHeaders({ secure: true })['Strict-Transport-Security'] ??
        '',
      /max-age=31536000/,
    );
  });
});

describe('content security policy', () => {
  test('defaults to same-origin and never allows unsafe inline scripts', () => {
    const policy = buildContentSecurityPolicy();
    assert.equal(cspDirective(policy, 'default-src'), "'self'");
    assert.equal(cspDirective(policy, 'script-src'), "'self'");
    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
    assert.equal(cspDirective(policy, 'frame-ancestors'), "'none'");
    assert.match(cspDirective(policy, 'frame-src') ?? '', /youtube-nocookie/);
    assert.match(cspDirective(policy, 'img-src') ?? '', /'self'/);
  });

  test('accepts the per-request nonce for inline scripts', () => {
    const policy = buildContentSecurityPolicy({ nonce: 'abc123' });
    const scriptSrc = cspDirective(policy, 'script-src') ?? '';
    assert.match(scriptSrc, /'self'/);
    assert.match(scriptSrc, /'nonce-abc123'/);
  });
});

describe('nonce generation', () => {
  test('produces unpredictable, URL-safe tokens', () => {
    const first = generateNonce();
    const second = generateNonce();
    assert.notEqual(first, second);
    assert.ok(first.length >= 16);
    assert.match(first, /^[A-Za-z0-9+/]+$/);
  });
});

describe('HSTS decision', () => {
  test('is sent only over HTTPS or in production', () => {
    assert.equal(shouldSendHsts('http', 'development'), false);
    assert.equal(shouldSendHsts('http:', 'test'), false);
    assert.equal(shouldSendHsts('https', 'development'), true);
    assert.equal(shouldSendHsts('https:', 'test'), true);
    assert.equal(shouldSendHsts('http', 'production'), true);
  });
});

describe('same-origin CSRF check', () => {
  const requestOrigin = 'https://app.uci.test';

  test('allows requests without an Origin (non-browser clients)', () => {
    assert.equal(
      isSameOriginRequest({ origin: undefined, requestOrigin }),
      true,
    );
    assert.equal(isSameOriginRequest({ origin: '', requestOrigin }), true);
  });

  test('allows a matching Origin', () => {
    assert.equal(
      isSameOriginRequest({ origin: 'https://app.uci.test', requestOrigin }),
      true,
    );
  });

  test('tolerates a TLS-terminating proxy scheme difference', () => {
    assert.equal(
      isSameOriginRequest({
        origin: 'https://app.uci.test',
        requestOrigin: 'http://app.uci.test',
      }),
      true,
    );
  });

  test('rejects a different host, subdomain suffix or malformed Origin', () => {
    assert.equal(
      isSameOriginRequest({ origin: 'https://evil.example', requestOrigin }),
      false,
    );
    assert.equal(
      isSameOriginRequest({
        origin: 'https://app.uci.test.evil.example',
        requestOrigin,
      }),
      false,
    );
    assert.equal(
      isSameOriginRequest({ origin: 'not-a-url', requestOrigin }),
      false,
    );
  });

  test('accepts an explicitly configured origin', () => {
    assert.equal(
      isSameOriginRequest({
        origin: 'https://uci.test',
        requestOrigin,
        allowedOrigins: ['https://uci.test'],
      }),
      true,
    );
  });

  test('only mutating methods are checked', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      assert.equal(isMutatingMethod(method), true, method);
    }
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      assert.equal(isMutatingMethod(method), false, method);
    }
  });
});

describe('Astro SSR middleware', () => {
  test('stamps the policy and a usable nonce over HTTPS', async () => {
    const context = {
      locals: {} as Record<string, unknown>,
      url: new URL('https://uci.test/nosotros'),
    };
    const response = await runAstroMiddleware(context);

    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.match(
      response.headers.get('content-security-policy') ?? '',
      /default-src 'self'/,
    );
    assert.ok(response.headers.get('strict-transport-security'));

    const nonce = context.locals.cspNonce;
    assert.equal(typeof nonce, 'string');
    assert.ok((nonce as string).length > 0);
    assert.ok(
      (response.headers.get('content-security-policy') ?? '').includes(
        `'nonce-${nonce as string}'`,
      ),
    );
  });

  test('does not send HSTS on plain-HTTP development', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const response = await runAstroMiddleware({
        ...BASE_CONTEXT,
        url: new URL('http://localhost:4321/nosotros'),
      });
      assert.equal(
        response.headers.get('strict-transport-security'),
        null,
      );
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
