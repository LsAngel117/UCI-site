/**
 * Sermon + taxonomy API calls for the admin panel (docs/08 §11).
 *
 * The relay is intentionally thin: every endpoint is declared once here with
 * its shared DTO type, so the editor and list screens cannot drift from the
 * contract. Payload validation and authorization stay on the server.
 */
import type {
  CreateSermonInput,
  ListResponse,
  PersonDto,
  PersonListQuery,
  SermonAdminDto,
  SermonListQuery,
  SermonRevisionDto,
  SermonSeriesDto,
  SermonSeriesListQuery,
  TopicDto,
  TopicListQuery,
  UpdateSermonInput,
} from '@shared/cms';
import { apiRequest, apiRequestList } from './api';
import { buildQuery } from './query';

function idPath(id: string): string {
  return encodeURIComponent(id);
}

export function listSermons(
  query: SermonListQuery = {},
  signal?: AbortSignal,
): Promise<ListResponse<SermonAdminDto>> {
  return apiRequestList<SermonAdminDto>(
    `/admin/sermons${buildQuery({ ...query })}`,
    { signal },
  );
}

export function getSermon(
  id: string,
  signal?: AbortSignal,
): Promise<SermonAdminDto> {
  return apiRequest<SermonAdminDto>(`/admin/sermons/${idPath(id)}`, { signal });
}

export function createSermon(
  input: CreateSermonInput,
): Promise<SermonAdminDto> {
  return apiRequest<SermonAdminDto>('/admin/sermons', {
    method: 'POST',
    body: input,
  });
}

export function updateSermon(
  id: string,
  input: UpdateSermonInput,
): Promise<SermonAdminDto> {
  return apiRequest<SermonAdminDto>(`/admin/sermons/${idPath(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function publishSermon(id: string): Promise<SermonAdminDto> {
  return apiRequest<SermonAdminDto>(
    `/admin/sermons/${idPath(id)}/publish`,
    { method: 'POST' },
  );
}

export function scheduleSermon(
  id: string,
  publishAt: string,
): Promise<SermonAdminDto> {
  return apiRequest<SermonAdminDto>(
    `/admin/sermons/${idPath(id)}/schedule`,
    { method: 'POST', body: { publishAt } },
  );
}

export function archiveSermon(id: string): Promise<SermonAdminDto> {
  return apiRequest<SermonAdminDto>(
    `/admin/sermons/${idPath(id)}/archive`,
    { method: 'POST' },
  );
}

export function listSermonRevisions(
  id: string,
  signal?: AbortSignal,
): Promise<SermonRevisionDto[]> {
  return apiRequest<SermonRevisionDto[]>(
    `/admin/sermons/${idPath(id)}/revisions`,
    { signal },
  );
}

export function restoreSermonRevision(
  id: string,
  revisionId: string,
): Promise<SermonAdminDto> {
  return apiRequest<SermonAdminDto>(
    `/admin/sermons/${idPath(id)}/revisions/${idPath(revisionId)}/restore`,
    { method: 'POST' },
  );
}

export function previewSermon(
  id: string,
  signal?: AbortSignal,
): Promise<SermonAdminDto> {
  return apiRequest<SermonAdminDto>(
    `/admin/sermons/${idPath(id)}/preview`,
    { signal },
  );
}

/** Collection pickers are capped at the documented maximum page size. */
const PICKER_LIMIT = 100;

export function listPeople(
  query: PersonListQuery = {},
  signal?: AbortSignal,
): Promise<ListResponse<PersonDto>> {
  return apiRequestList<PersonDto>(
    `/admin/people${buildQuery({ limit: PICKER_LIMIT, ...query })}`,
    { signal },
  );
}

export function listSeries(
  query: SermonSeriesListQuery = {},
  signal?: AbortSignal,
): Promise<ListResponse<SermonSeriesDto>> {
  return apiRequestList<SermonSeriesDto>(
    `/admin/series${buildQuery({ limit: PICKER_LIMIT, ...query })}`,
    { signal },
  );
}

export function listTopics(
  query: TopicListQuery = {},
  signal?: AbortSignal,
): Promise<ListResponse<TopicDto>> {
  return apiRequestList<TopicDto>(
    `/admin/topics${buildQuery({ limit: PICKER_LIMIT, ...query })}`,
    { signal },
  );
}
