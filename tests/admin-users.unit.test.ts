/**
 * Pure probes for the Phase 10D1 administration input validation (docs/08 §8,
 * §9, §21; docs/11 §9).
 *
 * These exercise the untrusted-boundary parsers without a database: the API is
 * the authority for what is accepted, so every rejection must be a stable
 * `VALIDATION_ERROR` (400) and every acceptance must be normalized (trimmed,
 * lowercased, deduplicated) before the service sees it.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isCmsError } from '@server/cms/errors';
import {
  parseAdminUserListQuery,
  parseCreateUserInput,
  parseUpdateUserInput,
} from '@server/admin/users/validation';
import { parseAuditLogListQuery } from '@server/admin/audit/validation';
import { parseUpdateRoleInput } from '@server/admin/roles/validation';

function expectValidation(run: () => unknown, label: string): void {
  assert.throws(
    run,
    (error: unknown) => {
      assert.ok(isCmsError(error), `${label}: expected a CmsError`);
      assert.equal(error.code, 'VALIDATION_ERROR', label);
      assert.equal(error.statusCode, 400, label);
      return true;
    },
    label,
  );
}

describe('admin user create input', () => {
  test('normalizes email, name, password and roles', () => {
    const parsed = parseCreateUserInput({
      email: '  JUAN@Example.ORG ',
      name: '  Juan Pérez  ',
      password: '  Secret-Passw0rd!  ',
      roles: [' EDITOR ', 'EDITOR', 'AUDITOR'],
    });
    assert.deepEqual(parsed, {
      email: 'juan@example.org',
      name: 'Juan Pérez',
      password: '  Secret-Passw0rd!  ',
      roles: ['EDITOR', 'AUDITOR'],
      active: true,
    });
  });

  test('roles are optional and default to an empty list', () => {
    const parsed = parseCreateUserInput({
      email: 'a@b.co',
      name: 'Ana',
      password: 'long-enough-password',
    });
    assert.deepEqual(parsed.roles, []);
  });

  test('rejects unknown keys and every malformed mandatory field', () => {
    const valid = {
      email: 'a@b.co',
      name: 'Ana',
      password: 'long-enough-password',
    };
    const invalid: unknown[] = [
      null,
      [],
      'user',
      {},
      { ...valid, email: '' },
      { ...valid, email: 'not-an-email' },
      { ...valid, email: 'a@b' },
      { ...valid, email: 42 },
      { ...valid, name: '   ' },
      { ...valid, name: 42 },
      { ...valid, password: 'short' },
      { ...valid, password: 12345678 },
      { ...valid, roles: 'EDITOR' },
      { ...valid, roles: ['EDITOR', 7] },
      { ...valid, passwordHash: 'leak' },
      { ...valid, status: 'PENDING' },
      { ...valid, role: 42 },
      { ...valid, role: '   ' },
      { ...valid, role: 'EDITOR', roles: ['AUDITOR'] },
    ];
    for (const payload of invalid) {
      expectValidation(
        () => parseCreateUserInput(payload),
        JSON.stringify(payload),
      );
    }
  });
});

describe('admin user create input — documented role/status aliases', () => {
  test('accepts a singular role and an ACTIVE status', () => {
    assert.deepEqual(
      parseCreateUserInput({
        email: 'a@b.co',
        name: 'Ana',
        password: 'long-enough-password',
        role: ' EDITOR ',
        status: 'ACTIVE',
      }),
      {
        email: 'a@b.co',
        name: 'Ana',
        password: 'long-enough-password',
        roles: ['EDITOR'],
        active: true,
      },
    );
  });

  test('maps INACTIVE to active=false case-insensitively and defaults to ACTIVE', () => {
    const inactive = parseCreateUserInput({
      email: 'a@b.co',
      name: 'Ana',
      password: 'long-enough-password',
      status: 'inactive',
    });
    assert.equal(inactive.active, false);
    assert.deepEqual(inactive.roles, []);

    const omitted = parseCreateUserInput({
      email: 'a@b.co',
      name: 'Ana',
      password: 'long-enough-password',
    });
    assert.equal(omitted.active, true);
  });
});

describe('admin user update input', () => {
  test('accepts only the mutable fields', () => {
    assert.deepEqual(parseUpdateUserInput({}), {});
    assert.deepEqual(parseUpdateUserInput({ name: '  Ana  ' }), {
      name: 'Ana',
    });
    assert.deepEqual(parseUpdateUserInput({ active: false }), {
      active: false,
    });
    assert.deepEqual(parseUpdateUserInput({ roles: ['ADMIN', 'ADMIN'] }), {
      roles: ['ADMIN'],
    });
  });

  test('never allows a password change through PATCH', () => {
    expectValidation(
      () => parseUpdateUserInput({ password: 'another-long-password' }),
      'password is rejected',
    );
    expectValidation(
      () => parseUpdateUserInput({ passwordHash: 'x' }),
      'passwordHash is rejected',
    );
  });

  test('rejects unknown keys and wrongly typed values', () => {
    const invalid: unknown[] = [
      null,
      [],
      { name: '   ' },
      { name: 42 },
      { active: 'false' },
      { roles: [1] },
      { roles: 'ADMIN' },
      { email: 'other@example.org' },
      { unexpected: true },
    ];
    for (const payload of invalid) {
      expectValidation(
        () => parseUpdateUserInput(payload),
        JSON.stringify(payload),
      );
    }
  });
});

describe('admin user list query', () => {
  test('resolves pagination and normalized filters', () => {
    const parsed = parseAdminUserListQuery({
      page: '2',
      limit: '5',
      search: '  juan ',
      role: ' EDITOR ',
      active: 'true',
      sort: 'email',
      order: 'asc',
    });
    assert.deepEqual(parsed, {
      page: 2,
      limit: 5,
      search: 'juan',
      role: 'EDITOR',
      active: true,
      sort: 'email',
      order: 'asc',
    });
  });

  test('accepts false and omits empty filters', () => {
    const parsed = parseAdminUserListQuery({ active: 'false', search: '   ' });
    assert.equal(parsed.active, false);
    assert.equal(parsed.search, undefined);
    assert.equal(parsed.role, undefined);
    assert.equal(parsed.page, 1);
    assert.equal(parsed.limit, 20);
  });

  test('rejects a non-boolean active filter', () => {
    expectValidation(
      () => parseAdminUserListQuery({ active: 'maybe' }),
      'active=maybe',
    );
  });

  test('maps the documented status filter to active case-insensitively', () => {
    assert.equal(parseAdminUserListQuery({ status: 'ACTIVE' }).active, true);
    assert.equal(parseAdminUserListQuery({ status: 'inactive' }).active, false);
    assert.equal(
      parseAdminUserListQuery({ status: ' ACTIVE ', active: 'true' }).active,
      true,
      'a consistent active/status pair is accepted',
    );
  });

  test('rejects an unsupported or conflicting status filter', () => {
    expectValidation(
      () => parseAdminUserListQuery({ status: 'PENDING' }),
      'status=PENDING',
    );
    expectValidation(
      () => parseAdminUserListQuery({ active: 'true', status: 'INACTIVE' }),
      'conflicting active/status',
    );
  });
});

describe('audit list query', () => {
  test('accepts documented filters and the docs/08 aliases', () => {
    const parsed = parseAuditLogListQuery({
      page: '1',
      limit: '50',
      actor: 'actor-1',
      action: 'user.create',
      entityType: 'USER',
      entityId: 'entity-1',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
    });
    assert.equal(parsed.page, 1);
    assert.equal(parsed.limit, 50);
    assert.equal(parsed.actor, 'actor-1');
    assert.equal(parsed.action, 'user.create');
    assert.equal(parsed.entityType, 'USER');
    assert.equal(parsed.entityId, 'entity-1');
    assert.ok(parsed.from instanceof Date);
    assert.ok(parsed.to instanceof Date);
  });

  test('maps user/resource/resourceId aliases', () => {
    const parsed = parseAuditLogListQuery({
      user: 'actor-2',
      resource: 'ROLE',
      resourceId: 'role-9',
    });
    assert.equal(parsed.actor, 'actor-2');
    assert.equal(parsed.entityType, 'ROLE');
    assert.equal(parsed.entityId, 'role-9');
  });

  test('rejects invalid dates and an inverted range', () => {
    expectValidation(
      () => parseAuditLogListQuery({ from: 'not-a-date' }),
      'invalid from',
    );
    expectValidation(
      () => parseAuditLogListQuery({ to: '2026-13-40' }),
      'invalid to',
    );
    expectValidation(
      () =>
        parseAuditLogListQuery({
          from: '2026-02-01T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
        }),
      'from after to',
    );
  });
});

describe('role update input', () => {
  test('accepts a deduplicated permission vocabulary', () => {
    assert.deepEqual(
      parseUpdateRoleInput({
        permissions: ['roles.read', 'users.read', 'roles.read'],
      }),
      { permissions: ['roles.read', 'users.read'] },
    );
  });

  test('rejects unknown keys, non-arrays and out-of-vocabulary names', () => {
    const invalid: unknown[] = [
      null,
      {},
      { permissions: 'roles.read' },
      { permissions: [42] },
      { permissions: ['roles.read', 'not.a.permission'] },
      { permissions: ['roles.read'], name: 'RENAMED' },
      { permissions: ['roles.read', 'roles.read', ''] },
    ];
    for (const payload of invalid) {
      expectValidation(
        () => parseUpdateRoleInput(payload),
        JSON.stringify(payload),
      );
    }
  });

  test('an empty permission list is structurally valid', () => {
    assert.deepEqual(parseUpdateRoleInput({ permissions: [] }), {
      permissions: [],
    });
  });
});
