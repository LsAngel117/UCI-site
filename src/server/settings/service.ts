/**
 * Public settings use cases (Phase 9A1, docs/08 §17).
 *
 * The service owns the single read/write of the `church.public` blob. Routes
 * stay thin: they validate the body (`validation.ts`), call one use case and
 * serialize the DTO. No Prisma model ever crosses the HTTP boundary.
 */
import { Prisma } from '@prisma/client';
import type {
  AdminSettingsDto,
  PublicSettingsDto,
  UpdateSettingsInput,
} from '@shared/settings';
import { prisma } from '../db';
import {
  PUBLIC_SETTINGS_KEY,
  readStored,
  toAdminDto,
  toPublicDto,
  type StoredChurch,
  type StoredPublicSettings,
} from './store';

async function loadStored(): Promise<StoredPublicSettings> {
  const row = await prisma.setting.findUnique({
    where: { key: PUBLIC_SETTINGS_KEY },
  });
  return readStored(row?.value ?? null);
}

/** Public projection consumed by the unauthenticated website. */
export async function getPublicSettings(): Promise<PublicSettingsDto> {
  return toPublicDto(await loadStored());
}

/** Complete settings for the admin panel. */
export async function getAdminSettings(): Promise<AdminSettingsDto> {
  return toAdminDto(await loadStored());
}

/** Pick a provided value, distinguishing an explicit `null` from "omitted". */
function pick<T>(next: T | undefined, current: T): T {
  return next === undefined ? current : next;
}

function mergeChurch(
  current: StoredChurch,
  input: UpdateSettingsInput['church'],
): StoredChurch {
  if (!input) return current;
  return {
    name: pick(input.name, current.name),
    shortDescription: pick(input.shortDescription, current.shortDescription),
    address: pick(input.address, current.address),
    city: pick(input.city, current.city),
    state: pick(input.state, current.state),
    phone: pick(input.phone, current.phone),
    email: pick(input.email, current.email),
    whatsapp: pick(input.whatsapp, current.whatsapp),
  };
}

/**
 * Apply a validated partial update. `church`/`giving` merge field by field;
 * `schedule`/`socials`, when present, replace the whole collection. The write
 * is a single atomic upsert.
 */
export async function updateSettings(
  input: UpdateSettingsInput,
): Promise<AdminSettingsDto> {
  const current = await loadStored();
  if (Object.keys(input).length === 0) return toAdminDto(current);

  const givingInput = input.giving;
  const schedule = input.schedule
    ? input.schedule.map((entry) => ({
        ...entry,
        endTime: entry.endTime ?? null,
      }))
    : current.schedule;
  const next: StoredPublicSettings = {
    church: mergeChurch(current.church, input.church),
    schedule,
    socials: input.socials ?? current.socials,
    giving: givingInput
      ? {
          title: pick(givingInput.title, current.giving.title),
          message: pick(givingInput.message, current.giving.message),
          ctaLabel: pick(givingInput.ctaLabel, current.giving.ctaLabel),
          url: pick(givingInput.url, current.giving.url),
        }
      : current.giving,
  };

  const value = next as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: PUBLIC_SETTINGS_KEY },
    update: { value },
    create: { key: PUBLIC_SETTINGS_KEY, value },
  });

  return toAdminDto(next);
}
