/**
 * Admin Media API (docs/08 §15, docs/12 §56).
 *
 * Thin HTTP layer over `MediaService`: routing, multipart parsing, auth and
 * the `{ data }` / `{ data, meta }` / `{ error: { code, message } }` envelopes.
 * Every route is protected server-side; the UI never decides authorization.
 */
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import type { ApiResponse } from '@shared/api';
import type {
  MediaDeleteResponse,
  MediaDto,
  MediaListQuery,
  MediaListResponse,
  MediaReferencesResponse,
} from '@shared/media';
import type { ServerConfig } from '../config';
import { requireAuth, requirePermission } from '../auth/middleware';
import {
  fileTooLarge,
  isMediaError,
  mediaErrorEnvelope,
  validation,
} from './errors';
import { createMediaService } from './service';
import type { MediaStorage } from './storage';

const BASE = '/api/v1/admin/media';

interface IdParams {
  id: string;
}

interface DeleteQuery {
  force?: string;
}

/** Send a standard error envelope when the failure is a `MediaError`. */
function handleError(reply: FastifyReply, error: unknown): void {
  if (isMediaError(error)) {
    reply.code(error.statusCode).send(mediaErrorEnvelope(error));
    return;
  }
  throw error;
}

/** Read multipart parts: one file plus optional text metadata. */
async function readUpload(
  request: FastifyRequest,
  maxBytes: number,
): Promise<{ file: MultipartFile; data: Buffer; fields: Record<string, string> }> {
  const fields: Record<string, string> = {};
  let file: MultipartFile | undefined;
  let data: Buffer | undefined;

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (file) {
          throw validation('Only one file may be uploaded per request.');
        }
        file = part;
        // Consume immediately so fields appearing after the file are parsed.
        data = await part.toBuffer();
        if (part.file.truncated || data.length > maxBytes) {
          throw fileTooLarge(maxBytes);
        }
      } else {
        fields[part.fieldname] = String(part.value ?? '');
      }
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE') throw fileTooLarge(maxBytes);
    if (code === 'FST_FILES_LIMIT') {
      throw validation('Only one file may be uploaded per request.');
    }
    if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
      throw validation('Expected a multipart/form-data request.');
    }
    throw error;
  }

  if (!file || !data) {
    throw validation('A multipart "file" field is required.', { field: 'file' });
  }
  return { file, data, fields };
}

export function registerMediaRoutes(
  app: FastifyInstance,
  config: ServerConfig,
  storage: MediaStorage,
): void {
  const service = createMediaService({
    storage,
    maxUploadBytes: config.media.maxUploadBytes,
  });

  const auth = requireAuth(config);
  const canRead = requirePermission('media.read');
  const canUpload = requirePermission('media.upload');
  const canUpdate = requirePermission('media.update');
  const canDelete = requirePermission('media.delete');

  app.get<{ Querystring: MediaListQuery }>(
    BASE,
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const { data, meta } = await service.list(request.query);
        reply.send({ data, meta } satisfies MediaListResponse);
      } catch (error) {
        handleError(reply, error);
      }
    },
  );

  // Read-only orphan review (Phase 12B, docs/12 §18, §60). Registered before
  // `/:id` so the static segment is unambiguous. It never deletes: cleanup is
  // an explicit administrator action, not an automatic job.
  app.get<{ Querystring: MediaListQuery }>(
    `${BASE}/orphans`,
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const { data, meta } = await service.listOrphans(request.query);
        reply.send({ data, meta } satisfies MediaListResponse);
      } catch (error) {
        handleError(reply, error);
      }
    },
  );

  app.get<{ Params: IdParams }>(
    `${BASE}/:id`,
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const data = await service.getById(request.params.id);
        reply.send({ data } satisfies ApiResponse<MediaDto>);
      } catch (error) {
        handleError(reply, error);
      }
    },
  );

  app.post(
    `${BASE}/upload`,
    { preHandler: [auth, canUpload] },
    async (request, reply) => {
      try {
        const { file, data, fields } = await readUpload(
          request,
          config.media.maxUploadBytes,
        );
        const media = await service.upload(
          { filename: file.filename, mimeType: file.mimetype, data },
          {
            folder: fields.folder,
            alt: fields.alt,
            title: fields.title,
            description: fields.description,
            caption: fields.caption,
          },
          request.user!.id,
        );
        reply.code(201).send({ data: media } satisfies ApiResponse<MediaDto>);
      } catch (error) {
        handleError(reply, error);
      }
    },
  );

  app.patch<{ Params: IdParams }>(
    `${BASE}/:id`,
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      try {
        const data = await service.updateMetadata(
          request.params.id,
          request.body ?? {},
          request.user!.id,
        );
        reply.send({ data } satisfies ApiResponse<MediaDto>);
      } catch (error) {
        handleError(reply, error);
      }
    },
  );

  app.delete<{ Params: IdParams; Querystring: DeleteQuery }>(
    `${BASE}/:id`,
    { preHandler: [auth, canDelete] },
    async (request, reply) => {
      try {
        const force =
          request.query.force === 'true' || request.query.force === '1';
        const data = await service.delete(
          request.params.id,
          force,
          request.user!.id,
        );
        reply.send({ data } satisfies ApiResponse<MediaDeleteResponse>);
      } catch (error) {
        handleError(reply, error);
      }
    },
  );

  app.get<{ Params: IdParams }>(
    `${BASE}/:id/references`,
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const data = await service.listReferences(request.params.id);
        reply.send({ data } satisfies ApiResponse<MediaReferencesResponse>);
      } catch (error) {
        handleError(reply, error);
      }
    },
  );
}