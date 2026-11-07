/**
 * Strict validation for `PATCH /api/v1/admin/settings` (Phase 9A1).
 *
 * The body is untrusted. Unknown keys, wrong types, malformed times, invalid
 * http(s) URLs and out-of-range weekdays are rejected with a 400 before any
 * write, so a rejected PATCH can never partially mutate stored settings
 * (docs/08 §17, §30). Every value is normalized (trimmed) here so the service
 * only ever persists clean data.
 *
 * The function is pure — it has no database dependency — so the contract can
 * be unit-tested without a server.
 */
import type {
  UpdateChurchInput,
  UpdateGivingInput,
  UpdateScheduleEntryInput,
  UpdateSettingsInput,
  UpdateSocialLinkInput,
} from '@shared/settings';
import { validation } from '../cms/errors';
import { isHttpUrl } from '../url';
import { isTimeOfDay } from './store';

const TOP_LEVEL_KEYS = new Set(['church', 'schedule', 'socials', 'giving']);
const CHURCH_KEYS = new Set([
  'name',
  'shortDescription',
  'address',
  'city',
  'state',
  'phone',
  'email',
  'whatsapp',
]);
const SCHEDULE_KEYS = new Set([
  'name',
  'dayOfWeek',
  'startTime',
  'endTime',
  'active',
]);
const SOCIAL_KEYS = new Set(['platform', 'label', 'url']);
const GIVING_KEYS = new Set(['title', 'message', 'ctaLabel', 'url']);

const MAX_NAME = 120;
const MAX_SHORT_DESCRIPTION = 300;
const MAX_ADDRESS = 300;
const MAX_CITY = 120;
const MAX_STATE = 120;
const MAX_PHONE = 40;
const MAX_EMAIL = 254;
const MAX_WHATSAPP = 40;
const MAX_SCHEDULE_NAME = 120;
const MAX_PLATFORM = 60;
const MAX_LABEL = 120;
const MAX_GIVING_TITLE = 120;
const MAX_GIVING_MESSAGE = 1000;
const MAX_GIVING_CTA = 60;

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
      throw validation(`"${field}.${key}" is not a supported setting.`, {
        field,
      });
    }
  }
}

function requiredText(
  value: unknown,
  field: string,
  max: number,
): string {
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

/** Optional church/giving text: `null` or blank clears the stored value. */
function nullableText(
  value: unknown,
  field: string,
  max: number,
): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be a string or null.`, { field });
  }
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.length > max) {
    throw validation(`"${field}" must be at most ${max} characters.`, {
      field,
    });
  }
  return text;
}

/** Social/giving URL: an absolute http(s) URL or `null` (not configured). */
function nullableUrl(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be an http(s) URL or null.`, { field });
  }
  const text = value.trim();
  if (!isHttpUrl(text)) {
    throw validation(`"${field}" must be an http(s) URL or null.`, { field });
  }
  return text;
}

function parseChurch(value: unknown): UpdateChurchInput {
  const record = asObject(value, 'church');
  rejectUnknownKeys(record, CHURCH_KEYS, 'church');
  const parsed: UpdateChurchInput = {};
  if ('name' in record) {
    parsed.name = requiredText(record.name, 'church.name', MAX_NAME);
  }
  if ('shortDescription' in record) {
    parsed.shortDescription = requiredText(
      record.shortDescription,
      'church.shortDescription',
      MAX_SHORT_DESCRIPTION,
    );
  }
  if ('address' in record) {
    parsed.address = nullableText(record.address, 'church.address', MAX_ADDRESS);
  }
  if ('city' in record) {
    parsed.city = nullableText(record.city, 'church.city', MAX_CITY);
  }
  if ('state' in record) {
    parsed.state = nullableText(record.state, 'church.state', MAX_STATE);
  }
  if ('phone' in record) {
    parsed.phone = nullableText(record.phone, 'church.phone', MAX_PHONE);
  }
  if ('email' in record) {
    parsed.email = nullableText(record.email, 'church.email', MAX_EMAIL);
  }
  if ('whatsapp' in record) {
    parsed.whatsapp = nullableText(
      record.whatsapp,
      'church.whatsapp',
      MAX_WHATSAPP,
    );
  }
  return parsed;
}

function parseSchedule(value: unknown): UpdateScheduleEntryInput[] {
  if (!Array.isArray(value)) {
    throw validation('"schedule" must be an array.', { field: 'schedule' });
  }
  return value.map((raw, index) => {
    const field = `schedule[${index}]`;
    const record = asObject(raw, field);
    rejectUnknownKeys(record, SCHEDULE_KEYS, field);

    if (typeof record.dayOfWeek !== 'number') {
      throw validation(`"${field}.dayOfWeek" must be a number.`, {
        field: `${field}.dayOfWeek`,
      });
    }
    const dayOfWeek = record.dayOfWeek;
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw validation(
        `"${field}.dayOfWeek" must be an integer between 0 and 6.`,
        { field: `${field}.dayOfWeek` },
      );
    }
    if (!isTimeOfDay(record.startTime)) {
      throw validation(
        `"${field}.startTime" must be a 24h "HH:mm" time.`,
        { field: `${field}.startTime` },
      );
    }
    let endTime: string | null = null;
    if ('endTime' in record && record.endTime !== null) {
      if (!isTimeOfDay(record.endTime)) {
        throw validation(
          `"${field}.endTime" must be a 24h "HH:mm" time or null.`,
          { field: `${field}.endTime` },
        );
      }
      endTime = record.endTime;
    }
    if (typeof record.active !== 'boolean') {
      throw validation(`"${field}.active" must be a boolean.`, {
        field: `${field}.active`,
      });
    }
    return {
      name: requiredText(record.name, `${field}.name`, MAX_SCHEDULE_NAME),
      dayOfWeek,
      startTime: record.startTime,
      endTime,
      active: record.active,
    } satisfies UpdateScheduleEntryInput;
  });
}

function parseSocials(value: unknown): UpdateSocialLinkInput[] {
  if (!Array.isArray(value)) {
    throw validation('"socials" must be an array.', { field: 'socials' });
  }
  return value.map((raw, index) => {
    const field = `socials[${index}]`;
    const record = asObject(raw, field);
    rejectUnknownKeys(record, SOCIAL_KEYS, field);
    return {
      platform: requiredText(record.platform, `${field}.platform`, MAX_PLATFORM),
      label: requiredText(record.label, `${field}.label`, MAX_LABEL),
      url: nullableUrl(record.url, `${field}.url`),
    } satisfies UpdateSocialLinkInput;
  });
}

function parseGiving(value: unknown): UpdateGivingInput {
  const record = asObject(value, 'giving');
  rejectUnknownKeys(record, GIVING_KEYS, 'giving');
  const parsed: UpdateGivingInput = {};
  if ('title' in record) {
    parsed.title = requiredText(record.title, 'giving.title', MAX_GIVING_TITLE);
  }
  if ('message' in record) {
    parsed.message = requiredText(
      record.message,
      'giving.message',
      MAX_GIVING_MESSAGE,
    );
  }
  if ('ctaLabel' in record) {
    parsed.ctaLabel = requiredText(
      record.ctaLabel,
      'giving.ctaLabel',
      MAX_GIVING_CTA,
    );
  }
  if ('url' in record) {
    parsed.url = nullableUrl(record.url, 'giving.url');
  }
  return parsed;
}

/**
 * Validate the untrusted PATCH body and return the accepted partial update.
 * Only documented keys are accepted; an empty object is a valid no-op.
 */
export function parseUpdateSettingsInput(value: unknown): UpdateSettingsInput {
  if (!isPlainObject(value)) {
    throw validation('The request body must be an object.');
  }
  rejectUnknownKeys(value, TOP_LEVEL_KEYS, 'settings');

  const parsed: UpdateSettingsInput = {};
  if ('church' in value) parsed.church = parseChurch(value.church);
  if ('schedule' in value) parsed.schedule = parseSchedule(value.schedule);
  if ('socials' in value) parsed.socials = parseSocials(value.socials);
  if ('giving' in value) parsed.giving = parseGiving(value.giving);
  return parsed;
}
