/**
 * Administration API client (Phase 10D2, docs/08 §8–§9, §14, §17–§18, §21).
 *
 * One declaration per endpoint the administration screens consume. Every call
 * reuses the shared same-origin transport, so it sends the HttpOnly session
 * cookie with `credentials: 'include'` and never touches browser storage. The
 * server remains the authority on authorization and validation.
 */
import type {
  AdminUserDto,
  AdminUserListQuery,
  AuditLogDto,
  AuditLogListQuery,
  CreateAdminUserInput,
  PermissionDto,
  RoleDto,
  UpdateAdminUserInput,
  UpdateRoleInput,
} from '@shared/admin';
import type {
  CreateNavigationInput,
  NavigationAdminDto,
  NavigationReorderInput,
  UpdateNavigationInput,
} from '@shared/cms';
import type { AdminSettingsDto, UpdateSettingsInput } from '@shared/settings';
import type { SiteSeoDto, UpdateSiteSeoInput } from '@shared/seo';
import { apiRequest, apiRequestList } from './api';
import { buildQuery } from './query';

function idPath(id: string): string {
  return encodeURIComponent(id);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function listAdminUsers(
  query: AdminUserListQuery = {},
  signal?: AbortSignal,
) {
  return apiRequestList<AdminUserDto>(
    `/admin/users${buildQuery({ ...query })}`,
    { signal },
  );
}

export function getAdminUser(
  id: string,
  signal?: AbortSignal,
): Promise<AdminUserDto> {
  return apiRequest<AdminUserDto>(`/admin/users/${idPath(id)}`, { signal });
}

export function createAdminUser(
  input: CreateAdminUserInput,
): Promise<AdminUserDto> {
  return apiRequest<AdminUserDto>('/admin/users', {
    method: 'POST',
    body: input,
  });
}

export function updateAdminUser(
  id: string,
  input: UpdateAdminUserInput,
): Promise<AdminUserDto> {
  return apiRequest<AdminUserDto>(`/admin/users/${idPath(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function disableAdminUser(id: string): Promise<AdminUserDto> {
  return apiRequest<AdminUserDto>(`/admin/users/${idPath(id)}/disable`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

/** Roles are returned as a plain array (no pagination envelope). */
export function listRoles(signal?: AbortSignal): Promise<RoleDto[]> {
  return apiRequest<RoleDto[]>('/admin/roles', { signal });
}

export function listPermissions(signal?: AbortSignal): Promise<PermissionDto[]> {
  return apiRequest<PermissionDto[]>('/admin/permissions', { signal });
}

export function updateRole(
  id: string,
  input: UpdateRoleInput,
): Promise<RoleDto> {
  return apiRequest<RoleDto>(`/admin/roles/${idPath(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function listAuditLogs(
  query: AuditLogListQuery = {},
  signal?: AbortSignal,
) {
  return apiRequestList<AuditLogDto>(
    `/admin/audit${buildQuery({ ...query })}`,
    { signal },
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getAdminSettings(
  signal?: AbortSignal,
): Promise<AdminSettingsDto> {
  return apiRequest<AdminSettingsDto>('/admin/settings', { signal });
}

export function updateAdminSettings(
  input: UpdateSettingsInput,
): Promise<AdminSettingsDto> {
  return apiRequest<AdminSettingsDto>('/admin/settings', {
    method: 'PATCH',
    body: input,
  });
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Navigation is returned as the complete ordered array (no pagination). */
export function listNavigation(
  signal?: AbortSignal,
): Promise<NavigationAdminDto[]> {
  return apiRequest<NavigationAdminDto[]>('/admin/navigation', { signal });
}

export function createNavigation(
  input: CreateNavigationInput,
): Promise<NavigationAdminDto> {
  return apiRequest<NavigationAdminDto>('/admin/navigation', {
    method: 'POST',
    body: input,
  });
}

export function updateNavigation(
  id: string,
  input: UpdateNavigationInput,
): Promise<NavigationAdminDto> {
  return apiRequest<NavigationAdminDto>(`/admin/navigation/${idPath(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteNavigation(id: string): Promise<void> {
  return apiRequest<void>(`/admin/navigation/${idPath(id)}`, {
    method: 'DELETE',
  });
}

export function reorderNavigation(
  input: NavigationReorderInput,
): Promise<NavigationAdminDto[]> {
  return apiRequest<NavigationAdminDto[]>('/admin/navigation/reorder', {
    method: 'POST',
    body: input,
  });
}

// ---------------------------------------------------------------------------
// Site SEO
// ---------------------------------------------------------------------------

export function getSiteSeo(signal?: AbortSignal): Promise<SiteSeoDto> {
  return apiRequest<SiteSeoDto>('/admin/seo', { signal });
}

export function updateSiteSeo(
  input: UpdateSiteSeoInput,
): Promise<SiteSeoDto> {
  return apiRequest<SiteSeoDto>('/admin/seo', {
    method: 'PATCH',
    body: input,
  });
}
