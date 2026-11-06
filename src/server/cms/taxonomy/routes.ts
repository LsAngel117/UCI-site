/**
 * Admin sermon taxonomy API (Phase 5A, T5; docs/05 §8–10, docs/11 §9).
 *
 * Routes for the editorial pickers behind sermon create/edit: people
 * (preachers), series and topics. Every route is authenticated and authorized
 * server-side. docs/11 §9 has no dedicated vocabulary for this taxonomy, so the
 * `sermons.*` permissions guard it — see the decision note in `service.ts`.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  ApiResponse,
  CreatePersonInput,
  CreateSermonSeriesInput,
  CreateTopicInput,
  ListResponse,
  PersonDto,
  PersonListQuery,
  SermonSeriesDto,
  SermonSeriesListQuery,
  TopicDto,
  TopicListQuery,
  UpdatePersonInput,
  UpdateSermonSeriesInput,
  UpdateTopicInput,
} from '@shared/cms';
import type { ServerConfig } from '../../config';
import { requireAuth, requirePermission } from '../../auth/middleware';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import {
  createPerson,
  createSeries,
  createTopic,
  listPeople,
  listSeries,
  listTopics,
  updatePerson,
  updateSeries,
  updateTopic,
} from './service';

/** Run a service call and translate the result/error into the standard envelope. */
async function send<T>(
  reply: FastifyReply,
  produce: () => Promise<T>,
): Promise<void> {
  try {
    const data = await produce();
    reply.send({ data } satisfies ApiResponse<T>);
  } catch (error) {
    if (isCmsError(error)) {
      reply.code(error.statusCode).send(cmsErrorEnvelope(error));
      return;
    }
    throw error;
  }
}

interface IdParams {
  id: string;
}

export function registerTaxonomyRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('sermons.read');
  const canCreate = requirePermission('sermons.create');
  const canUpdate = requirePermission('sermons.update');

  // --- People ---------------------------------------------------------------

  app.get<{ Querystring: PersonListQuery }>(
    '/api/v1/admin/people',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const { data, meta } = await listPeople(request.query);
        reply.send({ data, meta } satisfies ListResponse<PersonDto>);
      } catch (error) {
        if (isCmsError(error)) {
          reply.code(error.statusCode).send(cmsErrorEnvelope(error));
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/v1/admin/people',
    { preHandler: [auth, canCreate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as CreatePersonInput;
      reply.code(201);
      await send<PersonDto>(reply, () => createPerson(body));
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/people/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as UpdatePersonInput;
      await send<PersonDto>(reply, () => updatePerson(request.params.id, body));
    },
  );

  // --- Series ---------------------------------------------------------------

  app.get<{ Querystring: SermonSeriesListQuery }>(
    '/api/v1/admin/series',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const { data, meta } = await listSeries(request.query);
        reply.send({ data, meta } satisfies ListResponse<SermonSeriesDto>);
      } catch (error) {
        if (isCmsError(error)) {
          reply.code(error.statusCode).send(cmsErrorEnvelope(error));
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/v1/admin/series',
    { preHandler: [auth, canCreate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as CreateSermonSeriesInput;
      reply.code(201);
      await send<SermonSeriesDto>(reply, () => createSeries(body));
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/series/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as UpdateSermonSeriesInput;
      await send<SermonSeriesDto>(reply, () => updateSeries(request.params.id, body));
    },
  );

  // --- Topics ---------------------------------------------------------------

  app.get<{ Querystring: TopicListQuery }>(
    '/api/v1/admin/topics',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const { data, meta } = await listTopics(request.query);
        reply.send({ data, meta } satisfies ListResponse<TopicDto>);
      } catch (error) {
        if (isCmsError(error)) {
          reply.code(error.statusCode).send(cmsErrorEnvelope(error));
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/v1/admin/topics',
    { preHandler: [auth, canCreate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as CreateTopicInput;
      reply.code(201);
      await send<TopicDto>(reply, () => createTopic(body));
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/topics/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as UpdateTopicInput;
      await send<TopicDto>(reply, () => updateTopic(request.params.id, body));
    },
  );
}