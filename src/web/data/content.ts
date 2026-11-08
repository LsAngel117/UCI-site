/**
 * Public content archive/detail data access (Phase 9B1).
 *
 * Every route in this phase reads through this module — pages never import the
 * HTTP client directly. It preserves the honest degradation contract:
 *
 * - `ok`          -> real published data from the API;
 * - `unavailable` -> the API could not be reached (the page answers 503 with an
 *                    honest message instead of pretending the archive is empty);
 * - `not-found`   -> the API answered 404, which for a detail route is a real
 *                    404 page (drafts are indistinguishable from unknown slugs).
 */
import type {
  PaginationMeta,
  PublicEventDto,
  PublicEventListQuery,
  PublicMinistryDto,
  PublicMinistryListQuery,
  PublicPageDetailDto,
  PublicSermonDetailDto,
  PublicSermonDto,
  PublicSermonListQuery,
  PublicStoryDetailDto,
  PublicStoryDto,
  PublicStoryListQuery,
} from '@shared/cms';
import {
  getEvent,
  getEvents,
  getMinistries,
  getMinistry,
  getPage,
  getSermon,
  getSermons,
  getStory,
  getStories,
} from '../lib/api';

export type ListResult<T> =
  | { status: 'ok'; data: T[]; meta: PaginationMeta }
  | { status: 'unavailable' };

export type DetailResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'not-found' }
  | { status: 'unavailable' };

/**
 * Page detail adds the redirect foundation: an old published slug answers 404
 * with `details.redirectTo`, which the HTTP layer turns into a permanent
 * redirect after validating the destination.
 */
export type PageDetailResult =
  | DetailResult<PublicPageDetailDto>
  | { status: 'redirect'; redirectTo: string };

function warnUnavailable(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[uci] ${scope} unavailable — answering with an honest error state (${message}).`,
  );
}

// ---------------------------------------------------------------------------
// Sermons
// ---------------------------------------------------------------------------

export async function getSermonsArchive(
  params: PublicSermonListQuery,
): Promise<ListResult<PublicSermonDto>> {
  try {
    const response = await getSermons(params);
    return { status: 'ok', data: response.data, meta: response.meta };
  } catch (error) {
    warnUnavailable('sermon archive', error);
    return { status: 'unavailable' };
  }
}

export async function getSermonDetail(
  slug: string,
): Promise<DetailResult<PublicSermonDetailDto>> {
  try {
    const sermon = await getSermon(slug);
    return sermon ? { status: 'ok', data: sermon } : { status: 'not-found' };
  } catch (error) {
    warnUnavailable(`sermon ${slug}`, error);
    return { status: 'unavailable' };
  }
}

// ---------------------------------------------------------------------------
// Stories / testimonies (improvement B2)
// ---------------------------------------------------------------------------

export async function getStoriesArchive(
  params: PublicStoryListQuery,
): Promise<ListResult<PublicStoryDto>> {
  try {
    const response = await getStories(params);
    return { status: 'ok', data: response.data, meta: response.meta };
  } catch (error) {
    warnUnavailable('story archive', error);
    return { status: 'unavailable' };
  }
}

export async function getStoryDetail(
  slug: string,
): Promise<DetailResult<PublicStoryDetailDto>> {
  try {
    const story = await getStory(slug);
    return story ? { status: 'ok', data: story } : { status: 'not-found' };
  } catch (error) {
    warnUnavailable(`story ${slug}`, error);
    return { status: 'unavailable' };
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function getEventsArchive(
  params: PublicEventListQuery,
): Promise<ListResult<PublicEventDto>> {
  try {
    const response = await getEvents(params);
    return { status: 'ok', data: response.data, meta: response.meta };
  } catch (error) {
    warnUnavailable('event archive', error);
    return { status: 'unavailable' };
  }
}

export async function getEventDetail(
  slug: string,
): Promise<DetailResult<PublicEventDto>> {
  try {
    const event = await getEvent(slug);
    return event ? { status: 'ok', data: event } : { status: 'not-found' };
  } catch (error) {
    warnUnavailable(`event ${slug}`, error);
    return { status: 'unavailable' };
  }
}

// ---------------------------------------------------------------------------
// Ministries
// ---------------------------------------------------------------------------

export async function getMinistriesArchive(
  params: PublicMinistryListQuery,
): Promise<ListResult<PublicMinistryDto>> {
  try {
    const response = await getMinistries(params);
    return { status: 'ok', data: response.data, meta: response.meta };
  } catch (error) {
    warnUnavailable('ministry archive', error);
    return { status: 'unavailable' };
  }
}

export async function getMinistryDetail(
  slug: string,
): Promise<DetailResult<PublicMinistryDto>> {
  try {
    const ministry = await getMinistry(slug);
    return ministry
      ? { status: 'ok', data: ministry }
      : { status: 'not-found' };
  } catch (error) {
    warnUnavailable(`ministry ${slug}`, error);
    return { status: 'unavailable' };
  }
}

// ---------------------------------------------------------------------------
// CMS pages (`/{slug}`)
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/pages/:slug` for the public institutional page route.
 *
 * Drafts, scheduled, archived and unknown slugs all answer 404 from the API,
 * so they map to `not-found` here (an honest 404 page). A 404 that carries
 * `details.redirectTo` maps to `redirect` so `/{slug}` can answer a permanent
 * redirect instead of pretending the page vanished. An API outage stays
 * `unavailable` (503) instead of masquerading as a missing page.
 */
export async function getPageDetail(
  slug: string,
): Promise<PageDetailResult> {
  try {
    return await getPage(slug);
  } catch (error) {
    warnUnavailable(`page ${slug}`, error);
    return { status: 'unavailable' };
  }
}
