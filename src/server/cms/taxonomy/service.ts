/**
 * Sermon taxonomy service (Phase 5A, T5; docs/05 §8–10, docs/11 §9).
 *
 * Person, SermonSeries and Topic are sermon-owned taxonomy: they are edited by
 * the same editorial team that edits sermons. The permission vocabulary in
 * docs/11 §9 (and `@shared/api`) has no `people.*` / `series.*` / `topics.*`
 * resources, so these endpoints reuse `sermons.read/create/update`. Adding a
 * parallel vocabulary would fragment authorization for a single editorial
 * surface; this is a deliberate, documented decision, not an oversight.
 *
 * This module owns Prisma access for the taxonomy. The route layer only maps
 * HTTP to these calls and envelopes the result.
 */
import type { Person, SermonSeries, Topic } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  CreatePersonInput,
  CreateSermonSeriesInput,
  CreateTopicInput,
  PaginationMeta,
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
import {
  paginationOffset,
  resolvePagination,
  resolveSort,
  totalPages,
} from '@shared/query';
import { prisma } from '../../db';
import { findAssetById } from '../../media/repository';
import { notFound, slugTaken, validation } from '../errors';
import {
  generateUniqueSlug,
  normalizeSlug,
  requireAvailableSlug,
  type SlugTakenProbe,
} from '../slug';
import { isSlugUniqueViolation } from '../sermons/prisma-errors';

// ---------------------------------------------------------------------------
// Shared parsing helpers
// ---------------------------------------------------------------------------

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validation(`A non-empty "${field}" is required.`, { field });
  }
  return value.trim();
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be a string or null.`, { field });
  }
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw validation(`"${field}" must be a boolean.`, { field });
  }
  return value;
}

function optionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be an ISO date string or null.`, { field });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validation(`"${field}" must be a valid date.`, { field });
  }
  return date;
}

/** Query values arrive as strings; accept `true`/`false` and real booleans. */
function parseBooleanFilter(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw validation(`"${field}" must be true or false.`, { field });
}

async function assertMediaExists(id: string, field: string): Promise<void> {
  const asset = await findAssetById(id);
  if (!asset) {
    throw validation('The referenced media asset does not exist.', { field });
  }
}

async function resolveCreateSlug(
  name: string,
  explicit: unknown,
  probe: SlugTakenProbe,
): Promise<string> {
  if (explicit === undefined || explicit === null) {
    return generateUniqueSlug(name, probe);
  }
  if (typeof explicit !== 'string') {
    throw validation('"slug" must be a string.', { field: 'slug' });
  }
  return requireAvailableSlug(explicit, probe);
}

async function resolveUpdateSlug(
  explicit: unknown,
  probe: SlugTakenProbe,
  id: string,
): Promise<string | undefined> {
  if (explicit === undefined || explicit === null) return undefined;
  if (typeof explicit !== 'string') {
    throw validation('"slug" must be a string.', { field: 'slug' });
  }
  return requireAvailableSlug(explicit, probe, id);
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

export function toPersonDto(person: Person): PersonDto {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    displayName: person.displayName,
    role: person.role,
    photoMediaId: person.photoMediaId,
    active: person.active,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

export function toSeriesDto(series: SermonSeries): SermonSeriesDto {
  return {
    id: series.id,
    name: series.name,
    slug: series.slug,
    startDate: series.startDate ? series.startDate.toISOString() : null,
    endDate: series.endDate ? series.endDate.toISOString() : null,
    coverMediaId: series.coverMediaId,
    createdAt: series.createdAt.toISOString(),
    updatedAt: series.updatedAt.toISOString(),
  };
}

export function toTopicDto(topic: Topic): TopicDto {
  return {
    id: topic.id,
    name: topic.name,
    slug: topic.slug,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Slug probes
// ---------------------------------------------------------------------------

const seriesSlugProbe: SlugTakenProbe = async (slug, exceptId) => {
  const existing = await prisma.sermonSeries.findFirst({
    where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return existing !== null;
};

const topicSlugProbe: SlugTakenProbe = async (slug, exceptId) => {
  const existing = await prisma.topic.findFirst({
    where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return existing !== null;
};

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const PERSON_SORT_FIELDS = [
  'displayName',
  'firstName',
  'lastName',
  'createdAt',
  'updatedAt',
] as const;

export async function listPeople(
  query: PersonListQuery,
): Promise<{ data: PersonDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where: Prisma.PersonWhereInput = {};

  if (typeof query.search === 'string' && query.search.trim().length > 0) {
    where.OR = [
      { displayName: { contains: query.search, mode: 'insensitive' } },
      { firstName: { contains: query.search, mode: 'insensitive' } },
      { lastName: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const active = parseBooleanFilter(query.active, 'active');
  if (active !== undefined) where.active = active;

  const requested = resolveSort(query.sort, query.order, PERSON_SORT_FIELDS);
  const orderBy = (
    requested
      ? { [requested.field]: requested.order }
      : { displayName: 'asc' }
  ) as Prisma.PersonOrderByWithRelationInput;

  const [total, rows] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
    }),
  ]);

  return {
    data: rows.map(toPersonDto),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

export async function createPerson(input: CreatePersonInput): Promise<PersonDto> {
  const firstName = requireText(input.firstName, 'firstName');
  const lastName = requireText(input.lastName, 'lastName');
  const displayName =
    input.displayName === undefined || input.displayName === null
      ? `${firstName} ${lastName}`
      : requireText(input.displayName, 'displayName');
  const photoMediaId = optionalText(input.photoMediaId, 'photoMediaId');
  if (photoMediaId) await assertMediaExists(photoMediaId, 'photoMediaId');

  const person = await prisma.person.create({
    data: {
      firstName,
      lastName,
      displayName,
      role: optionalText(input.role, 'role'),
      photoMediaId,
      active: optionalBoolean(input.active, 'active') ?? true,
    },
  });
  return toPersonDto(person);
}

export async function updatePerson(
  id: string,
  input: UpdatePersonInput,
): Promise<PersonDto> {
  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) throw notFound('Person not found.');

  const data: Prisma.PersonUncheckedUpdateInput = {};
  if ('firstName' in input) data.firstName = requireText(input.firstName, 'firstName');
  if ('lastName' in input) data.lastName = requireText(input.lastName, 'lastName');
  if ('displayName' in input) {
    data.displayName = requireText(input.displayName, 'displayName');
  }
  if ('role' in input) data.role = optionalText(input.role, 'role');

  if ('photoMediaId' in input) {
    const photoMediaId = optionalText(input.photoMediaId, 'photoMediaId');
    if (photoMediaId) await assertMediaExists(photoMediaId, 'photoMediaId');
    data.photoMediaId = photoMediaId;
  }
  if ('active' in input) {
    const active = optionalBoolean(input.active, 'active');
    if (active === undefined) {
      throw validation('"active" must be a boolean.', { field: 'active' });
    }
    data.active = active;
  }

  const person = await prisma.person.update({ where: { id }, data });
  return toPersonDto(person);
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

const SERIES_SORT_FIELDS = [
  'name',
  'slug',
  'startDate',
  'createdAt',
  'updatedAt',
] as const;

export async function listSeries(
  query: SermonSeriesListQuery,
): Promise<{ data: SermonSeriesDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where: Prisma.SermonSeriesWhereInput = {};

  if (typeof query.search === 'string' && query.search.trim().length > 0) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { slug: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const requested = resolveSort(query.sort, query.order, SERIES_SORT_FIELDS);
  const orderBy = (
    requested ? { [requested.field]: requested.order } : { name: 'asc' }
  ) as Prisma.SermonSeriesOrderByWithRelationInput;

  const [total, rows] = await Promise.all([
    prisma.sermonSeries.count({ where }),
    prisma.sermonSeries.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
    }),
  ]);

  return {
    data: rows.map(toSeriesDto),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

export async function createSeries(
  input: CreateSermonSeriesInput,
): Promise<SermonSeriesDto> {
  const name = requireText(input.name, 'name');
  const slug = await resolveCreateSlug(name, input.slug, seriesSlugProbe);
  const coverMediaId = optionalText(input.coverMediaId, 'coverMediaId');
  if (coverMediaId) await assertMediaExists(coverMediaId, 'coverMediaId');

  try {
    const series = await prisma.sermonSeries.create({
      data: {
        name,
        slug,
        startDate: optionalDate(input.startDate, 'startDate'),
        endDate: optionalDate(input.endDate, 'endDate'),
        coverMediaId,
      },
    });
    return toSeriesDto(series);
  } catch (error) {
    // Same probe/INSERT race as sermons: surface it as 409 SLUG_TAKEN.
    if (isSlugUniqueViolation(error)) throw slugTaken(slug);
    throw error;
  }
}

export async function updateSeries(
  id: string,
  input: UpdateSermonSeriesInput,
): Promise<SermonSeriesDto> {
  const existing = await prisma.sermonSeries.findUnique({ where: { id } });
  if (!existing) throw notFound('Series not found.');

  const data: Prisma.SermonSeriesUncheckedUpdateInput = {};
  if ('name' in input) data.name = requireText(input.name, 'name');

  const slug = await resolveUpdateSlug(input.slug, seriesSlugProbe, id);
  if (slug !== undefined) data.slug = slug;

  if ('startDate' in input) data.startDate = optionalDate(input.startDate, 'startDate');
  if ('endDate' in input) data.endDate = optionalDate(input.endDate, 'endDate');

  if ('coverMediaId' in input) {
    const coverMediaId = optionalText(input.coverMediaId, 'coverMediaId');
    if (coverMediaId) await assertMediaExists(coverMediaId, 'coverMediaId');
    data.coverMediaId = coverMediaId;
  }

  try {
    const series = await prisma.sermonSeries.update({ where: { id }, data });
    return toSeriesDto(series);
  } catch (error) {
    if (slug !== undefined && isSlugUniqueViolation(error)) throw slugTaken(slug);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

const TOPIC_SORT_FIELDS = ['name', 'slug', 'createdAt', 'updatedAt'] as const;

/**
 * Normalize a topic name for duplicate detection (docs/05 §10: "debe evitarse
 * crear duplicados por diferencias de escritura"). Surrounding and repeated
 * whitespace, casing and diacritics are all ignored.
 */
function normalizeTopicName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Find an existing topic whose name matches `name` ignoring writing
 * differences. The candidate query stays bounded (case-insensitive name or the
 * derived slug, which strips diacritics), then the normalized names are
 * compared in JS so accent-only variants also collapse.
 */
async function findTopicByNormalizedName(name: string): Promise<Topic | null> {
  const normalized = normalizeTopicName(name);
  const candidates = await prisma.topic.findMany({
    where: {
      OR: [
        { name: { equals: name, mode: 'insensitive' } },
        { slug: normalizeSlug(name) },
      ],
    },
  });
  return (
    candidates.find((topic) => normalizeTopicName(topic.name) === normalized) ??
    null
  );
}

export async function listTopics(
  query: TopicListQuery,
): Promise<{ data: TopicDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where: Prisma.TopicWhereInput = {};

  if (typeof query.search === 'string' && query.search.trim().length > 0) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { slug: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const requested = resolveSort(query.sort, query.order, TOPIC_SORT_FIELDS);
  const orderBy = (
    requested ? { [requested.field]: requested.order } : { name: 'asc' }
  ) as Prisma.TopicOrderByWithRelationInput;

  const [total, rows] = await Promise.all([
    prisma.topic.count({ where }),
    prisma.topic.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
    }),
  ]);

  return {
    data: rows.map(toTopicDto),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

export async function createTopic(input: CreateTopicInput): Promise<TopicDto> {
  const name = requireText(input.name, 'name');
  // Idempotent by normalized name: a writing-difference duplicate returns the
  // existing topic instead of creating a second row (docs/05 §10).
  const existing = await findTopicByNormalizedName(name);
  if (existing) return toTopicDto(existing);

  const slug = await resolveCreateSlug(name, input.slug, topicSlugProbe);

  try {
    const topic = await prisma.topic.create({ data: { name, slug } });
    return toTopicDto(topic);
  } catch (error) {
    if (isSlugUniqueViolation(error)) throw slugTaken(slug);
    throw error;
  }
}

export async function updateTopic(
  id: string,
  input: UpdateTopicInput,
): Promise<TopicDto> {
  const existing = await prisma.topic.findUnique({ where: { id } });
  if (!existing) throw notFound('Topic not found.');

  const data: Prisma.TopicUncheckedUpdateInput = {};
  if ('name' in input) data.name = requireText(input.name, 'name');

  const slug = await resolveUpdateSlug(input.slug, topicSlugProbe, id);
  if (slug !== undefined) data.slug = slug;

  try {
    const topic = await prisma.topic.update({ where: { id }, data });
    return toTopicDto(topic);
  } catch (error) {
    if (slug !== undefined && isSlugUniqueViolation(error)) throw slugTaken(slug);
    throw error;
  }
}