/**
 * Validation for the admin users API (Phase 10D1, docs/08 §8).
 *
 * The request body/query is untrusted. Every parser here either returns a
 * normalized value (trimmed, lowercased, deduplicated, pagination resolved) or
 * throws a `VALIDATION_ERROR` (400) before any service/DB call. Parsers are
 * pure — no database import — so the contract is unit-testable.
 */
import type {
  AdminUserListQuery,
  CreateAdminUserInput,
  UpdateAdminUserInput,
} from '@shared/admin';
import { resolvePagination } from '@shared/query';
import { validation } from '../../cms/errors';

const CREATE_KEYS = new Set([
  'email',
  'name',
  'password',
  'roles',
  'role',
  'status',
]);
const UPDATE_KEYS = new Set(['name', 'active', 'roles']);

const MAX_EMAIL = 254;
const MAX_NAME = 160;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const MAX_SEARCH = 200;

/** Pragmatic single-address check; final authority is the unique DB column. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw validation(`"${field}" must be an object.`, { field });
  }
  return value;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  field: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw validation(`"${field}.${key}" is not a supported field.`, {
        field,
      });
    }
  }
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be a string.`, { field });
  }
  const text = value.trim();
  if (text.length === 0) {
    throw validation(`"${field}" must not be empty.`, { field });
  }
  if (text.length > max) {
    throw validation(`"${field}" must be at most ${max} characters.`, {
      field,
    });
  }
  return text;
}

function normalizeEmail(value: unknown): string {
  const email = requiredText(value, 'email', MAX_EMAIL).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw validation('"email" must be a valid email address.', {
      field: 'email',
    });
  }
  return email;
}

function normalizePassword(value: unknown): string {
  if (typeof value !== 'string') {
    throw validation('"password" must be a string.', { field: 'password' });
  }
  if (value.length < MIN_PASSWORD) {
    throw validation(
      `"password" must be at least ${MIN_PASSWORD} characters.`,
      { field: 'password' },
    );
  }
  if (value.length > MAX_PASSWORD) {
    throw validation(
      `"password" must be at most ${MAX_PASSWORD} characters.`,
      { field: 'password' },
    );
  }
  return value;
}

/** Role names: non-empty trimmed strings, deduplicated, order preserved. */
function normalizeRoleNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw validation('"roles" must be an array of role names.', {
      field: 'roles',
    });
  }
  const names: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') {
      throw validation('Each role must be a role name string.', {
        field: 'roles',
      });
    }
    const name = raw.trim();
    if (name.length === 0) {
      throw validation('Role names must not be empty.', { field: 'roles' });
    }
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** A single role name alias (docs/08 §8.3). */
function normalizeRoleName(value: unknown): string {
  if (typeof value !== 'string') {
    throw validation('"role" must be a role name string.', { field: 'role' });
  }
  const name = value.trim();
  if (name.length === 0) {
    throw validation('"role" must not be empty.', { field: 'role' });
  }
  return name;
}

/** `ACTIVE`/`INACTIVE` (case-insensitive) → `true`/`false`. */
function normalizeStatus(value: unknown, field: string): boolean {
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be ACTIVE or INACTIVE.`, { field });
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === 'ACTIVE') return true;
  if (normalized === 'INACTIVE') return false;
  throw validation(`"${field}" must be ACTIVE or INACTIVE.`, { field });
}

/**
 * Validate `POST /api/v1/admin/users`. Password whitespace is preserved on
 * purpose: it is part of the secret and must be hashed exactly as received.
 *
 * `role`/`status` are the docs/08 §8.3 spellings and are normalized into
 * `roles`/`active`. They are aliases, so supplying both members of a pair is
 * rejected instead of silently picking one.
 */
export function parseCreateUserInput(value: unknown): CreateAdminUserInput {
  const record = asObject(value, 'body');
  rejectUnknownKeys(record, CREATE_KEYS, 'body');

  let roles: string[];
  if (record.role !== undefined && record.roles !== undefined) {
    throw validation('Use either "role" or "roles", not both.', {
      field: 'role',
    });
  } else if (record.role !== undefined) {
    roles = [normalizeRoleName(record.role)];
  } else {
    roles =
      record.roles === undefined ? [] : normalizeRoleNames(record.roles);
  }

  return {
    email: normalizeEmail(record.email),
    name: requiredText(record.name, 'name', MAX_NAME),
    password: normalizePassword(record.password),
    roles,
    active:
      record.status === undefined
        ? true
        : normalizeStatus(record.status, 'status'),
  };
}

/**
 * Validate `PATCH /api/v1/admin/users/:id`. Only `name`, `active` and `roles`
 * are mutable; an explicit `password` is rejected rather than silently
 * ignored so a client can never believe a credential changed.
 */
export function parseUpdateUserInput(value: unknown): UpdateAdminUserInput {
  const record = asObject(value, 'body');
  if ('password' in record || 'passwordHash' in record) {
    throw validation(
      'Password cannot be changed through this endpoint.',
      { field: 'password' },
    );
  }
  rejectUnknownKeys(record, UPDATE_KEYS, 'body');

  const parsed: UpdateAdminUserInput = {};
  if ('name' in record) {
    parsed.name = requiredText(record.name, 'name', MAX_NAME);
  }
  if ('active' in record) {
    if (typeof record.active !== 'boolean') {
      throw validation('"active" must be a boolean.', { field: 'active' });
    }
    parsed.active = record.active;
  }
  if ('roles' in record) {
    parsed.roles = normalizeRoleNames(record.roles);
  }
  return parsed;
}

function parseActiveFilter(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw validation('"active" must be true or false.', { field: 'active' });
}

/** An omitted/blank `status` filter is ignored; anything unsupported is a 400. */
function parseStatusFilter(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return normalizeStatus(value, 'status');
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be a string.`, { field });
  }
  const text = value.trim();
  if (text.length === 0) return undefined;
  if (text.length > max) {
    throw validation(`"${field}" must be at most ${max} characters.`, {
      field,
    });
  }
  return text;
}

/** Normalize `GET /api/v1/admin/users` query parameters. */
export function parseAdminUserListQuery(
  value: unknown,
): Required<Pick<AdminUserListQuery, 'page' | 'limit'>> &
  Omit<AdminUserListQuery, 'page' | 'limit'> {
  const record = isPlainObject(value) ? value : {};
  const { page, limit } = resolvePagination(record.page, record.limit);
  const parsed: Required<Pick<AdminUserListQuery, 'page' | 'limit'>> &
    Omit<AdminUserListQuery, 'page' | 'limit'> = { page, limit };

  const search = optionalText(record.search, 'search', MAX_SEARCH);
  if (search !== undefined) parsed.search = search;
  const role = optionalText(record.role, 'role', MAX_NAME);
  if (role !== undefined) parsed.role = role;
  const active = parseActiveFilter(record.active);
  const status = parseStatusFilter(record.status);
  if (status !== undefined) {
    // `status` is the docs/08 §8.1 spelling of the same filter. A contradictory
    // pair is rejected rather than resolved by an implicit precedence.
    if (active !== undefined && active !== status) {
      throw validation('"status" conflicts with "active".', {
        field: 'status',
      });
    }
    parsed.active = status;
  } else if (active !== undefined) {
    parsed.active = active;
  }
  const sort = optionalText(record.sort, 'sort', 64);
  if (sort !== undefined) parsed.sort = sort;
  const order = optionalText(record.order, 'order', 4);
  if (order !== undefined) parsed.order = order;
  return parsed;
}
