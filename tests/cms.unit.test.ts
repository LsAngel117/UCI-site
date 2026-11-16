/**
 * CMS core unit regression suite (Phase 3, docs/05 §27–32, docs/08 §22/§38).
 *
 * Pure, database-free characterization of the reusable core:
 *   - slug normalization / validation / uniqueness;
 *   - lifecycle transition rules and the optimistic-concurrency guard;
 *   - schedule-instant validation;
 *   - the error envelope contract.
 *
 * Anything that needs PostgreSQL lives in `cms.e2e.test.ts`.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  generateUniqueSlug,
  isValidSlug,
  normalizeSlug,
  requireAvailableSlug,
} from '@server/cms/slug';
import {
  assertTransition,
  assertVersionMatches,
  canTransition,
  resolveScheduleInstant,
} from '@server/cms/lifecycle';
import { CmsError, cmsErrorEnvelope } from '@server/cms/errors';
import { isSlugUniqueViolation } from '@server/cms/sermons/prisma-errors';

/** A probe that treats the supplied set as already-taken. */
function takenSet(slugs: string[]) {
  return async (slug: string) => slugs.includes(slug);
}

describe('slug normalization (docs/05 §27)', () => {
  test('lowercases, de-accentuates and hyphenates', () => {
    assert.equal(normalizeSlug('Obediencia y Fe'), 'obediencia-y-fe');
    assert.equal(normalizeSlug('Cristo Rey: Éxodo 20'), 'cristo-rey-exodo-20');
  });

  test('trims and collapses separators', () => {
    assert.equal(normalizeSlug('  ¡Hola,  Mundo!  '), 'hola-mundo');
    assert.equal(normalizeSlug('a---b___c'), 'a-b-c');
    assert.equal(normalizeSlug('---leading-and-trailing---'), 'leading-and-trailing');
  });

  test('isValidSlug accepts canonical output and rejects malformed input', () => {
    assert.equal(isValidSlug('obediencia-y-fe'), true);
    assert.equal(isValidSlug('a-1-b2'), true);
    assert.equal(isValidSlug(''), false);
    assert.equal(isValidSlug('-leading'), false);
    assert.equal(isValidSlug('trailing-'), false);
    assert.equal(isValidSlug('Uppercase'), false);
    assert.equal(isValidSlug('has space'), false);
  });
});

describe('slug uniqueness (docs/05 §27)', () => {
  test('requireAvailableSlug normalizes and returns a free slug', async () => {
    const slug = await requireAvailableSlug('  Obediencia y Fe ', takenSet([]));
    assert.equal(slug, 'obediencia-y-fe');
  });

  test('requireAvailableSlug rejects a taken slug with SLUG_TAKEN (409)', async () => {
    await assert.rejects(
      () => requireAvailableSlug('obediencia-y-fe', takenSet(['obediencia-y-fe'])),
      (error: unknown) => {
        assert.ok(error instanceof CmsError);
        assert.equal(error.code, 'SLUG_TAKEN');
        assert.equal(error.statusCode, 409);
        return true;
      },
    );
  });

  test('requireAvailableSlug rejects an empty/invalid slug with VALIDATION_ERROR', async () => {
    await assert.rejects(
      () => requireAvailableSlug('¡!¡!', takenSet([])),
      (error: unknown) => {
        assert.ok(error instanceof CmsError);
        assert.equal(error.code, 'VALIDATION_ERROR');
        return true;
      },
    );
  });

  test('generateUniqueSlug suffixes until free', async () => {
    const slug = await generateUniqueSlug(
      'Obediencia y fe',
      takenSet(['obediencia-y-fe', 'obediencia-y-fe-2']),
    );
    assert.equal(slug, 'obediencia-y-fe-3');
  });

  test('the exceptId option ignores the entity being edited', async () => {
    // "self" already owns `mi-sermon`, so only a different row counts.
    const probe = async (slug: string, exceptId?: string) =>
      slug === 'mi-sermon' && exceptId !== 'self';
    const slug = await requireAvailableSlug('mi-sermon', probe, 'self');
    assert.equal(slug, 'mi-sermon');
  });
});

describe('lifecycle transitions (docs/08 §22)', () => {
  test('publish is allowed from draft/scheduled/unpublished/archived', () => {
    for (const from of ['draft', 'scheduled', 'unpublished', 'archived'] as const) {
      assert.equal(canTransition(from, 'publish'), true, `publish from ${from}`);
    }
  });

  test('an already-published item cannot be published again', () => {
    assert.equal(canTransition('published', 'publish'), false);
    assert.throws(
      () => assertTransition('published', 'publish'),
      (error: unknown) => {
        assert.ok(error instanceof CmsError);
        assert.equal(error.code, 'CONFLICT');
        assert.equal(error.statusCode, 409);
        return true;
      },
    );
  });

  test('schedule targets the scheduled state and only from editable states', () => {
    assert.equal(assertTransition('draft', 'schedule'), 'scheduled');
    assert.equal(assertTransition('scheduled', 'schedule'), 'scheduled');
    assert.equal(canTransition('published', 'schedule'), false);
  });

  test('archive targets archived and unpublish only leaves published', () => {
    assert.equal(assertTransition('published', 'archive'), 'archived');
    assert.equal(assertTransition('published', 'unpublish'), 'unpublished');
    assert.equal(canTransition('draft', 'unpublish'), false);
  });
});

describe('optimistic concurrency (docs/08 §38)', () => {
  test('a matching version yields the next version', () => {
    assert.equal(assertVersionMatches(4, 4), 5);
  });

  test('a stale version is a 409 CONFLICT', () => {
    assert.throws(
      () => assertVersionMatches(4, 3),
      (error: unknown) => {
        assert.ok(error instanceof CmsError);
        assert.equal(error.code, 'CONFLICT');
        assert.equal(error.statusCode, 409);
        return true;
      },
    );
  });

  test('a missing/invalid version is a 400', () => {
    assert.throws(
      () => assertVersionMatches(1, 0),
      (error: unknown) => error instanceof CmsError && error.statusCode === 400,
    );
  });
});

describe('schedule instant validation (docs/08 §37)', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');

  test('accepts a valid future instant', () => {
    const instant = resolveScheduleInstant('2026-10-11T08:00:00.000Z', now);
    assert.equal(instant.toISOString(), '2026-10-11T08:00:00.000Z');
  });

  test('rejects a past instant and an invalid value', () => {
    assert.throws(
      () => resolveScheduleInstant('2026-10-09T08:00:00.000Z', now),
      (error: unknown) => error instanceof CmsError && error.statusCode === 400,
    );
    assert.throws(
      () => resolveScheduleInstant('not-a-date', now),
      (error: unknown) => error instanceof CmsError && error.statusCode === 400,
    );
    assert.throws(
      () => resolveScheduleInstant(undefined, now),
      (error: unknown) => error instanceof CmsError && error.statusCode === 400,
    );
  });
});

describe('error envelope (docs/08 §30)', () => {
  test('cmsErrorEnvelope renders code, message and details', () => {
    const envelope = cmsErrorEnvelope(new CmsError('CONFLICT', 'boom', 409, { a: 1 }));
    assert.deepEqual(envelope, {
      error: { code: 'CONFLICT', message: 'boom', details: { a: 1 } },
    });
  });
});

describe('slug unique-violation detection (docs/05 §27)', () => {
  test('detects P2002 on the slug column (array or constraint-name target)', () => {
    assert.equal(
      isSlugUniqueViolation({ code: 'P2002', meta: { target: ['slug'] } }),
      true,
    );
    assert.equal(
      isSlugUniqueViolation({ code: 'P2002', meta: { target: 'slug' } }),
      true,
    );
    assert.equal(
      isSlugUniqueViolation({ code: 'P2002', meta: { target: ['sermons_slug_key'] } }),
      true,
      'named constraint form must still match',
    );
  });

  test('ignores unique violations on other columns and non-Prisma errors', () => {
    assert.equal(
      isSlugUniqueViolation({ code: 'P2002', meta: { target: ['email'] } }),
      false,
    );
    assert.equal(
      isSlugUniqueViolation({ code: 'P2003', meta: { target: ['slug'] } }),
      false,
    );
    assert.equal(isSlugUniqueViolation({ code: 'P2002' }), false);
    assert.equal(isSlugUniqueViolation(new Error('boom')), false);
    assert.equal(isSlugUniqueViolation(null), false);
    assert.equal(isSlugUniqueViolation('P2002'), false);
  });
});
