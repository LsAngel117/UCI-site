/**
 * Story / testimony API calls for the admin panel (improvement B2).
 *
 * Stories reuse the `pages.*` permission vocabulary (docs/11 §9 has no
 * `stories.*`), so the editor gates its controls with those same permissions.
 */
import type {
  CreateStoryInput,
  ListResponse,
  StoryAdminDto,
  StoryListQuery,
  UpdateStoryInput,
} from '@shared/cms';
import { apiRequest, apiRequestList } from './api';
import { buildQuery } from './query';

function idPath(id: string): string {
  return encodeURIComponent(id);
}

export function listStories(
  query: StoryListQuery = {},
  signal?: AbortSignal,
): Promise<ListResponse<StoryAdminDto>> {
  return apiRequestList<StoryAdminDto>(
    `/admin/stories${buildQuery({ ...query })}`,
    { signal },
  );
}

export function getStory(
  id: string,
  signal?: AbortSignal,
): Promise<StoryAdminDto> {
  return apiRequest<StoryAdminDto>(`/admin/stories/${idPath(id)}`, { signal });
}

export function createStory(input: CreateStoryInput): Promise<StoryAdminDto> {
  return apiRequest<StoryAdminDto>('/admin/stories', {
    method: 'POST',
    body: input,
  });
}

export function updateStory(
  id: string,
  input: UpdateStoryInput,
): Promise<StoryAdminDto> {
  return apiRequest<StoryAdminDto>(`/admin/stories/${idPath(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function publishStory(id: string): Promise<StoryAdminDto> {
  return apiRequest<StoryAdminDto>(`/admin/stories/${idPath(id)}/publish`, {
    method: 'POST',
  });
}

export function scheduleStory(
  id: string,
  publishAt: string,
): Promise<StoryAdminDto> {
  return apiRequest<StoryAdminDto>(`/admin/stories/${idPath(id)}/schedule`, {
    method: 'POST',
    body: { publishAt },
  });
}

export function archiveStory(id: string): Promise<StoryAdminDto> {
  return apiRequest<StoryAdminDto>(`/admin/stories/${idPath(id)}/archive`, {
    method: 'POST',
  });
}
