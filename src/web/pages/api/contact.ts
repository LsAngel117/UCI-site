/**
 * same-origin contact proxy (Phase 9B2).
 *
 * The public site and the API are separate origins; the browser must not call
 * the API cross-origin (the API keeps a restrictive CORS policy, docs/08 §41).
 * The form therefore posts to `/api/contact` on the Astro server, which
 * forwards the payload to `POST /api/v1/contact` and relays the status/body.
 *
 * This route adds no validation of its own: the API is the single source of
 * truth. It exists purely as a same-origin transport bridge.
 *
 * Client identity: the API rate-limits `POST /api/v1/contact` per IP, so this
 * proxy must forward the real client address in `X-Forwarded-For`. An upstream
 * proxy that already resolved the client (a CDN or reverse proxy) takes
 * precedence; otherwise the socket-derived `clientAddress` is used.
 */
import type { APIRoute } from 'astro';
import { getApiBaseUrl, getApiTimeoutMs } from '../../lib/api';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

/**
 * Resolve the `X-Forwarded-For` value to relay to the API.
 *
 * Prefers an address already resolved upstream (the header is set by a trusted
 * proxy in front of Astro); falls back to Astro's `clientAddress`, which is the
 * connection peer when Astro is the edge. Returns `null` when neither exists.
 */
export function resolveForwardedFor(
  request: Request,
  clientAddress?: string,
): string | null {
  const upstream = request.headers.get('x-forwarded-for');
  if (upstream !== null && upstream.trim().length > 0) {
    return upstream.trim();
  }

  const client = clientAddress?.trim();
  return client && client.length > 0 ? client : null;
}

interface ErrorEnvelope {
  error: { code: string; message: string };
}

function jsonError(
  status: number,
  code: string,
  message: string,
): Response {
  const body: ErrorEnvelope = { error: { code, message } };
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function readPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await request.formData();
    return {
      name: form.get('name') ?? '',
      email: form.get('email') ?? '',
      message: form.get('message') ?? '',
    };
  }

  return request.json();
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let payload: unknown;
  try {
    payload = await readPayload(request);
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'No pudimos leer la solicitud.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getApiTimeoutMs());

  const forwardedFor = resolveForwardedFor(request, clientAddress);
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  };
  if (forwardedFor !== null) headers['x-forwarded-for'] = forwardedFor;

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/contact`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[uci] contact proxy unavailable — answering 503 (${message}).`,
    );
    return jsonError(
      503,
      'SERVICE_UNAVAILABLE',
      'El formulario no está disponible en este momento. Intenta de nuevo en unos minutos.',
    );
  } finally {
    clearTimeout(timer);
  }
};
