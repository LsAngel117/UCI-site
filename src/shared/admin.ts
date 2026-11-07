/**
 * Administrative contracts (Phase 10D1, docs/08 §8–§9, §21; docs/11 §9).
 *
 * The admin panel consumes these DTOs from the `/api/v1/admin/*` endpoints.
 * They are plain, framework-agnostic shapes: no Prisma model, no storage
 * column and — critically — no `passwordHash` is ever part of them
 * (docs/02 §66, docs/08 §48, §55, docs/11 §5.3).
 *
 * Endpoint decision (documented here because docs/08 §8 lists `/api/v1/users`
 * while §21/§47 use `/api/v1/admin/*`): every administration endpoint lives
 * under `/api/v1/admin/` for consistency with the rest of the panel and with
 * the canonical route table in docs/08 §53:
 *
 *   GET    /api/v1/admin/users
 *   POST   /api/v1/admin/users
 *   GET    /api/v1/admin/users/:id
 *   PATCH  /api/v1/admin/users/:id
 *   POST   /api/v1/admin/users/:id/disable
 *   GET    /api/v1/admin/roles
 *   PATCH  /api/v1/admin/roles/:id
 *   GET    /api/v1/admin/permissions
 *   GET    /api/v1/admin/audit
 */
import type { PermissionName } from './api';

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** Role reference embedded in a user DTO (never the full permission matrix). */
export interface AdminRoleSummaryDto {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Administrative user projection. `name` is the display name derived from the
 * stored first/last name (falling back to the email local part).
 */
export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  active: boolean;
  roles: AdminRoleSummaryDto[];
  createdAt: string;
  updatedAt: string;
}

/** Filters accepted by `GET /api/v1/admin/users`. */
export interface AdminUserListQuery {
  page?: number | string;
  limit?: number | string;
  /** Matches email, first name or last name (case-insensitive). */
  search?: string;
  /** Role name, e.g. `EDITOR`. */
  role?: string;
  /** Exact account state. */
  active?: boolean | string;
  /**
   * Account state alias documented in docs/08 §8.1 (`ACTIVE`/`INACTIVE`,
   * case-insensitive). Normalized into `active`; an unsupported value is a
   * 400 rather than a silently ignored filter.
   */
  status?: string;
  sort?: string;
  order?: 'asc' | 'desc' | string;
}

/**
 * Body of `POST /api/v1/admin/users`.
 *
 * `name` is the full display name. The persistence schema splits names into
 * `firstName`/`lastName`; until dedicated inputs exist, the trimmed full name
 * is stored as `firstName`, so it round-trips through `AdminUserDto.name`
 * without inventing a split.
 *
 * `roles` are role **names**; docs/08 §8.3 uses the singular `"role": "EDITOR"`,
 * accepted as an alias and normalized into `roles`. Unknown names are rejected
 * with a 400 before any write.
 *
 * `status` (`ACTIVE`/`INACTIVE`, docs/08 §8.3) is normalized into `active`;
 * it defaults to `true` when omitted.
 */
export interface CreateAdminUserInput {
  email: string;
  name: string;
  password: string;
  roles?: string[];
  /** Single role name alias (docs/08 §8.3), normalized into `roles`. */
  role?: string;
  /** Normalized account state (default `true`). */
  active?: boolean;
  /** Account state alias (docs/08 §8.3), normalized into `active`. */
  status?: 'ACTIVE' | 'INACTIVE' | string;
}

/**
 * Body of `PATCH /api/v1/admin/users/:id`.
 *
 * Password is deliberately absent: changing a credential is a separate,
 * auditable flow (docs/11 §39–40), never a side effect of a profile edit.
 */
export interface UpdateAdminUserInput {
  name?: string;
  active?: boolean;
  roles?: string[];
}

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

/** One entry of the canonical permission vocabulary (docs/11 §9). */
export interface PermissionDto {
  name: PermissionName;
  description: string | null;
}

/** A role with its full permission grant set. */
export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  permissions: PermissionDto[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Body of `PATCH /api/v1/admin/roles/:id`. The permission list is a complete
 * replacement, not a delta: the supplied set becomes the role's grants.
 */
export interface UpdateRoleInput {
  permissions: PermissionName[];
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** Actor embedded in an audit record (never credentials or session data). */
export interface AuditActorDto {
  id: string;
  name: string;
  email: string;
}

/**
 * Append-only audit record (docs/08 §21). `metadata` is the structured,
 * already-redacted context the action recorded; it never carries passwords or
 * tokens.
 */
export interface AuditLogDto {
  id: string;
  actor: AuditActorDto | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
}

/**
 * Filters accepted by `GET /api/v1/admin/audit`.
 *
 * `actor`/`entityType`/`entityId` are the canonical names; the docs/08 §21
 * aliases `user`/`resource`/`resourceId` are accepted for compatibility.
 */
export interface AuditLogListQuery {
  page?: number | string;
  limit?: number | string;
  /** Actor user id. */
  actor?: string;
  /** Alias of `actor` (docs/08 §21). */
  user?: string;
  action?: string;
  entityType?: string;
  /** Alias of `entityType` (docs/08 §21). */
  resource?: string;
  entityId?: string;
  /** Alias of `entityId` (docs/08 §21). */
  resourceId?: string;
  /** Inclusive lower bound (ISO 8601). */
  from?: string;
  /** Inclusive upper bound (ISO 8601). */
  to?: string;
}
