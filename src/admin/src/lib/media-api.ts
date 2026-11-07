/**
 * Admin media API client (Phase 10C, docs/08 §15, docs/12 §56).
 *
 * JSON endpoints reuse the shared transport in `api.ts`. Uploads use
 * `XMLHttpRequest` because it is the only browser API that reports progress for
 * a multipart request; like every other call it is same-origin and sends the
 * HttpOnly session cookie (`withCredentials`), so no token ever reaches storage.
 */
import type {
  MediaDeleteResponse,
  MediaDto,
  MediaListQuery,
  MediaReferencesResponse,
  UpdateMediaInput,
  UploadMetadataInput,
} from '@shared/media';
import type { PaginationMeta } from '@shared/api';
import { ApiError, apiRequest, apiRequestList } from './api';
import { MEDIA_UPLOAD_MAX_BYTES, normalizeUploadMetadata, type UploadMetadataForm } from './media';
import { buildQuery } from './query';

const BASE = '/admin/media';

function idPath(id: string): string {
  return encodeURIComponent(id);
}

export function listMedia(
  query: MediaListQuery = {},
  signal?: AbortSignal,
): Promise<{ data: MediaDto[]; meta: PaginationMeta }> {
  return apiRequestList<MediaDto>(
    `${BASE}${buildQuery({ limit: 24, ...query })}`,
    { signal },
  );
}

export function getMedia(
  id: string,
  signal?: AbortSignal,
): Promise<MediaDto> {
  return apiRequest<MediaDto>(`${BASE}/${idPath(id)}`, { signal });
}

export function getMediaReferences(
  id: string,
  signal?: AbortSignal,
): Promise<MediaReferencesResponse> {
  return apiRequest<MediaReferencesResponse>(
    `${BASE}/${idPath(id)}/references`,
    { signal },
  );
}

export function updateMediaMetadata(
  id: string,
  input: UpdateMediaInput,
): Promise<MediaDto> {
  return apiRequest<MediaDto>(`${BASE}/${idPath(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteMedia(
  id: string,
  force = false,
): Promise<MediaDeleteResponse> {
  const query = force ? '?force=true' : '';
  return apiRequest<MediaDeleteResponse>(`${BASE}/${idPath(id)}${query}`, {
    method: 'DELETE',
  });
}

export interface UploadProgress {
  loaded: number;
  total: number;
  /** 0–100; always an integer. */
  percent: number;
}

export interface UploadMediaOptions {
  /**
   * Cancels the client request. This ends our wait but does not roll anything
   * back: once the server has received the body it may still persist the asset.
   */
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
  /** Bytes finished sending; the server is now validating/processing. */
  onProcessing?: () => void;
}

interface UploadEnvelope {
  data?: MediaDto;
  error?: { code?: string; message?: string };
}

function parseUploadEnvelope(raw: string): UploadEnvelope {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as UploadEnvelope;
  } catch {
    return {};
  }
}

/**
 * Upload one file with optional editorial metadata. Resolves with the created
 * asset; rejects with an `ApiError` carrying the server's status and stable code
 * (401/403/413/422), which the dialog renders honestly.
 */
export function uploadMedia(
  file: File,
  metadata: UploadMetadataInput | UploadMetadataForm = {},
  options: UploadMediaOptions = {},
): Promise<MediaDto> {
  return new Promise<MediaDto>((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name);

    const normalized = normalizeUploadMetadata({
      folder: metadata.folder ?? '',
      alt: metadata.alt ?? '',
      title: metadata.title ?? '',
      description: metadata.description ?? '',
      caption: metadata.caption ?? '',
    });
    for (const [key, value] of Object.entries(normalized)) {
      if (value === undefined || value === null || value === '') continue;
      form.append(key, String(value));
    }

    const xhr = new XMLHttpRequest();
    let settled = false;

    function cleanup() {
      options.signal?.removeEventListener('abort', onAbort);
    }

    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function succeed(media: MediaDto) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(media);
    }

    function onAbort() {
      xhr.abort();
      fail(new DOMException('Upload cancelled', 'AbortError'));
    }

    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener('abort', onAbort);

    xhr.open('POST', `/api/v1${BASE}/upload`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !options.onProgress) return;
      const total = event.total || file.size || 1;
      const percent = Math.min(100, Math.round((event.loaded / total) * 100));
      options.onProgress({ loaded: event.loaded, total, percent });
    };
    xhr.upload.onload = () => {
      options.onProcessing?.();
    };

    xhr.onload = () => {
      const envelope = parseUploadEnvelope(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && envelope.data) {
        succeed(envelope.data);
        return;
      }
      fail(
        new ApiError(
          xhr.status,
          envelope.error?.code ?? 'REQUEST_ERROR',
          envelope.error?.message ?? 'No pudimos subir el archivo.',
        ),
      );
    };
    xhr.onerror = () => {
      fail(
        new ApiError(
          0,
          'NETWORK_ERROR',
          'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.',
        ),
      );
    };
    xhr.onabort = () => {
      fail(new DOMException('Upload cancelled', 'AbortError'));
    };
    xhr.ontimeout = () => {
      fail(
        new ApiError(
          0,
          'NETWORK_ERROR',
          'La carga tardó demasiado. Intentá de nuevo.',
        ),
      );
    };

    xhr.send(form);
  });
}

export { MEDIA_UPLOAD_MAX_BYTES };
