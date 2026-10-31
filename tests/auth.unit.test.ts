/**
 * Auth unit regression suite (Phase 2, docs/11 §5.3, §8, §9).
 *
 * Pure, database-free characterization of the auth building blocks:
 *   - password hashing/verification (Argon2id)
 *   - the canonical permission vocabulary vs docs/11 §9
 *   - the EDITOR baseline grant
 *   - the `requirePermission` preHandler contract (401 / 403 / pass-through)
 *
 * These tests never query PostgreSQL, so they run on every machine. Anything
 * that needs the database lives in `auth.e2e.test.ts`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PERMISSIONS, isPermissionName, type PermissionName } from '@shared/api';
import { hashPassword, verifyPassword } from '@server/auth/password';
import { EDITOR_PERMISSIONS } from '@server/auth/permissions';
import { can } from '@server/auth/authorization';
import {
  requirePermission,
  type AuthenticatedUser,
} from '@server/auth/middleware';

/** Extract the canonical permission list from docs/11 §9 (single source: the doc). */
function documentedPermissions(): string[] {
  const doc = readFileSync(
    new URL('../docs/11-security-and-permissions.md', import.meta.url),
    'utf8',
  );
  const marker = '## 9. Permission Model';
  const start = doc.indexOf(marker);
  assert.notEqual(start, -1, 'docs/11 §9 heading not found');

  const terminator = 'This is an initial vocabulary';
  const rest = doc.slice(start);
  const end = rest.indexOf(terminator);
  assert.notEqual(end, -1, 'docs/11 §9 terminator not found');

  const section = rest.slice(0, end);
  const fenced = section.match(/```text\n([\s\S]*?)```/);
  assert.ok(fenced, 'permission vocabulary code block not found in docs/11 §9');

  return fenced[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

interface CapturedReply {
  statusCode?: number;
  payload?: unknown;
}

/** Minimal Fastify reply double that records `code()`/`send()` calls. */
function makeReply(captured: CapturedReply): FastifyReply {
  const reply = {
    code(status: number): unknown {
      captured.statusCode = status;
      return reply;
    },
    send(payload: unknown): unknown {
      captured.payload = payload;
      return reply;
    },
  };
  return reply as unknown as FastifyReply;
}

/** Request double carrying (or omitting) the authenticated principal. */
function makeRequest(user?: AuthenticatedUser): FastifyRequest {
  return { user } as unknown as FastifyRequest;
}

/**
 * Call a `requirePermission` hook directly. Fastify's `preHandlerHookHandler`
 * declares a `this: FastifyInstance` context that only exists when the router
 * invokes it; the unit test calls the body in isolation, so the type is
 * narrowed to a plain two-argument function.
 */
type IsolatedHook = (
  request: FastifyRequest,
  reply: FastifyReply,
) => unknown;

function hookFor(permission: PermissionName): IsolatedHook {
  return requirePermission(permission) as unknown as IsolatedHook;
}

function makeUser(permissions: AuthenticatedUser['permissions']): AuthenticatedUser {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@uci.local',
    role: 'EDITOR',
    permissions,
  };
}

describe('password hashing (Argon2id)', () => {
  test('hashPassword produces a PHC-encoded Argon2id hash', async () => {
    const stored = await hashPassword('correct horse battery staple');
    assert.ok(
      stored.startsWith('$argon2id$'),
      `expected an $argon2id$ PHC prefix, got "${stored}"`,
    );
  });

  test('verifyPassword accepts the right password and rejects the wrong one', async () => {
    const stored = await hashPassword('S3cret-Passw0rd!');
    assert.equal(await verifyPassword(stored, 'S3cret-Passw0rd!'), true);
    assert.equal(await verifyPassword(stored, 'not-the-password'), false);
  });

  test('verifyPassword returns false (never throws) for a malformed hash', async () => {
    await assert.doesNotReject(async () => {
      assert.equal(await verifyPassword('garbage', 'anything'), false);
    });
    assert.equal(await verifyPassword('garbage', 'anything'), false);
  });
});

describe('permission vocabulary (docs/11 §9)', () => {
  test('PERMISSIONS matches docs/11 §9 exactly, in the same order', () => {
    const documented = documentedPermissions();
    assert.equal(documented.length, 40, 'docs/11 §9 must list 40 permissions');
    assert.equal(PERMISSIONS.length, 40, 'PERMISSIONS must hold 40 entries');
    assert.deepEqual([...PERMISSIONS], documented);
  });

  test('isPermissionName understands the vocabulary and rejects unknowns', () => {
    assert.equal(isPermissionName('pages.publish'), true);
    assert.equal(isPermissionName('content.read'), false);
  });
});

describe('EDITOR baseline grant (docs/11 §8.2)', () => {
  test('editor never receives publish/delete/archive or administration', () => {
    for (const permission of EDITOR_PERMISSIONS) {
      assert.ok(
        !permission.endsWith('.publish'),
        `EDITOR must not hold "${permission}"`,
      );
      assert.ok(
        !permission.endsWith('.delete'),
        `EDITOR must not hold "${permission}"`,
      );
      assert.ok(
        !permission.endsWith('.archive'),
        `EDITOR must not hold "${permission}"`,
      );
      for (const privileged of [
        'users.',
        'roles.',
        'audit.',
        'settings.',
        'navigation.',
      ]) {
        assert.ok(
          !permission.startsWith(privileged),
          `EDITOR must not hold "${permission}"`,
        );
      }
    }
  });

  test('can() resolves the editor baseline correctly', () => {
    assert.equal(can(EDITOR_PERMISSIONS, 'pages.create'), true);
    assert.equal(can(EDITOR_PERMISSIONS, 'sermons.publish'), false);
  });
});

describe('requirePermission preHandler contract (docs/11 §12)', () => {
  test('unauthenticated request is answered with 401', async () => {
    const captured: CapturedReply = {};
    await hookFor('pages.create')(makeRequest(), makeReply(captured));
    assert.equal(captured.statusCode, 401);
  });

  test('authenticated user without the permission is answered with 403', async () => {
    const captured: CapturedReply = {};
    await hookFor('pages.create')(makeRequest(makeUser([])), makeReply(captured));
    assert.equal(captured.statusCode, 403);
  });

  test('authenticated user holding the permission passes through untouched', async () => {
    const captured: CapturedReply = {};
    await hookFor('pages.create')(
      makeRequest(makeUser(['pages.create'])),
      makeReply(captured),
    );
    assert.equal(captured.statusCode, undefined);
    assert.equal(captured.payload, undefined);
  });
});
