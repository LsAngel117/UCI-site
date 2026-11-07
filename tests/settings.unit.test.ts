/**
 * Phase 9A1 — public settings contract unit suite (docs/08 §17).
 *
 * The PATCH validator and the stored→DTO projection are pure (no database),
 * so their exact accept/reject behavior and the "no internal fields leak"
 * guarantee are pinned here without a server.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  DEFAULT_PUBLIC_SETTINGS,
  readStored,
  toAdminDto,
  toPublicDto,
} from '@server/settings/store';
import { parseUpdateSettingsInput } from '@server/settings/validation';
import type { CmsError } from '@server/cms/errors';

function isValidationError(error: unknown): boolean {
  return (error as CmsError).code === 'VALIDATION_ERROR';
}

function rejects(run: () => unknown): void {
  assert.throws(run, isValidationError);
}

describe('parseUpdateSettingsInput', () => {
  test('an empty body is a valid no-op', () => {
    assert.deepEqual(parseUpdateSettingsInput({}), {});
  });

  test('accepts and normalizes a complete valid payload', () => {
    const parsed = parseUpdateSettingsInput({
      church: {
        name: '  Iglesia UCI  ',
        shortDescription: '  Una comunidad  ',
        address: '  Calle 1  ',
        city: '  Villavicencio ',
        state: ' Meta ',
      },
      schedule: [
        {
          name: '  Servicio dominical ',
          dayOfWeek: 0,
          startTime: '09:00',
          endTime: '11:00',
          active: true,
        },
      ],
      socials: [
        { platform: 'instagram', label: 'Instagram', url: 'https://instagram.com/uci' },
        { platform: 'facebook', label: 'Facebook', url: null },
      ],
      giving: {
        title: '  Dar  ',
        message: '  Mensaje  ',
        ctaLabel: '  Dar ahora ',
        url: 'https://give.example.org',
      },
    });

    assert.deepEqual(parsed, {
      church: {
        name: 'Iglesia UCI',
        shortDescription: 'Una comunidad',
        address: 'Calle 1',
        city: 'Villavicencio',
        state: 'Meta',
      },
      schedule: [
        {
          name: 'Servicio dominical',
          dayOfWeek: 0,
          startTime: '09:00',
          endTime: '11:00',
          active: true,
        },
      ],
      socials: [
        { platform: 'instagram', label: 'Instagram', url: 'https://instagram.com/uci' },
        { platform: 'facebook', label: 'Facebook', url: null },
      ],
      giving: {
        title: 'Dar',
        message: 'Mensaje',
        ctaLabel: 'Dar ahora',
        url: 'https://give.example.org',
      },
    });
  });

  test('an omitted schedule endTime normalizes to null', () => {
    const parsed = parseUpdateSettingsInput({
      schedule: [
        { name: 'Servicio', dayOfWeek: 3, startTime: '19:00', active: false },
      ],
    });
    assert.equal(parsed.schedule?.[0]?.endTime, null);
  });

  test('blank nullable address/city/state and giving fields clear to null/empty', () => {
    const parsed = parseUpdateSettingsInput({
      church: { address: '   ', city: null, state: '' },
      giving: { url: null },
    });
    assert.deepEqual(parsed.church, { address: null, city: null, state: null });
    assert.equal(parsed.giving?.url, null);
  });

  test('church contact fields are accepted, trimmed and nullable', () => {
    const parsed = parseUpdateSettingsInput({
      church: {
        phone: '  +57 300 111 2233  ',
        email: '  hola@uci.example.org ',
        whatsapp: '   ',
      },
    });
    assert.deepEqual(parsed.church, {
      phone: '+57 300 111 2233',
      email: 'hola@uci.example.org',
      whatsapp: null,
    });

    const cleared = parseUpdateSettingsInput({
      church: { phone: null, email: null, whatsapp: null },
    });
    assert.deepEqual(cleared.church, {
      phone: null,
      email: null,
      whatsapp: null,
    });
  });

  test('non-string church contact values are rejected', () => {
    rejects(() =>
      parseUpdateSettingsInput({ church: { phone: 123 as never } }),
    );
    rejects(() =>
      parseUpdateSettingsInput({ church: { email: {} as never } }),
    );
    rejects(() =>
      parseUpdateSettingsInput({ church: { whatsapp: [] as never } }),
    );
  });

  test('unknown top-level and nested keys are rejected', () => {
    rejects(() => parseUpdateSettingsInput({ secret: 'leak' }));
    rejects(() =>
      parseUpdateSettingsInput({ church: { internalNote: 'x' } }),
    );
    rejects(() =>
      parseUpdateSettingsInput({ giving: { bankAccount: '123' } }),
    );
    rejects(() =>
      parseUpdateSettingsInput({
        socials: [{ platform: 'x', label: 'X', url: null, token: 'x' }],
      }),
    );
  });

  test('non-object bodies and non-object sections are rejected', () => {
    rejects(() => parseUpdateSettingsInput(null));
    rejects(() => parseUpdateSettingsInput([]));
    rejects(() => parseUpdateSettingsInput('{}'));
    rejects(() => parseUpdateSettingsInput({ church: [] }));
    rejects(() => parseUpdateSettingsInput({ giving: 'copy' }));
    rejects(() => parseUpdateSettingsInput({ schedule: {} }));
    rejects(() => parseUpdateSettingsInput({ socials: 'x' }));
  });

  test('blank and over-long required text is rejected', () => {
    rejects(() => parseUpdateSettingsInput({ church: { name: '   ' } }));
    rejects(() =>
      parseUpdateSettingsInput({ church: { name: 'x'.repeat(121) } }),
    );
    rejects(() =>
      parseUpdateSettingsInput({
        socials: [{ platform: '', label: 'X', url: null }],
      }),
    );
    rejects(() =>
      parseUpdateSettingsInput({
        giving: { message: 'x'.repeat(1001) },
      }),
    );
  });

  test('dayOfWeek must be an integer 0–6', () => {
    for (const dayOfWeek of [-1, 7, 1.5, '0', null]) {
      rejects(() =>
        parseUpdateSettingsInput({
          schedule: [
            {
              name: 'Servicio',
              dayOfWeek: dayOfWeek as never,
              startTime: '09:00',
              active: true,
            },
          ],
        }),
      );
    }
  });

  test('startTime/endTime must be 24h HH:mm', () => {
    for (const time of ['9:00', '24:00', '09:60', '0900', '09:00:00', null]) {
      rejects(() =>
        parseUpdateSettingsInput({
          schedule: [
            {
              name: 'Servicio',
              dayOfWeek: 0,
              startTime: time as never,
              active: true,
            },
          ],
        }),
      );
    }
    rejects(() =>
      parseUpdateSettingsInput({
        schedule: [
          {
            name: 'Servicio',
            dayOfWeek: 0,
            startTime: '09:00',
            endTime: '25:00',
            active: true,
          },
        ],
      }),
    );
  });

  test('schedule active must be a boolean', () => {
    rejects(() =>
      parseUpdateSettingsInput({
        schedule: [
          {
            name: 'Servicio',
            dayOfWeek: 0,
            startTime: '09:00',
            active: 'yes' as never,
          },
        ],
      }),
    );
  });

  test('social and giving URLs must be http(s) or null', () => {
    for (const url of [
      'javascript:alert(1)',
      'ftp://example.org',
      '#',
      'https://',
      'https:// ',
      'https://?x',
      'http://',
      'not a url',
    ]) {
      rejects(() =>
        parseUpdateSettingsInput({
          socials: [{ platform: 'x', label: 'X', url }],
        }),
      );
      rejects(() => parseUpdateSettingsInput({ giving: { url } }));
    }

    const parsed = parseUpdateSettingsInput({
      socials: [{ platform: 'x', label: 'X', url: 'http://example.org/a' }],
      giving: { url: 'https://example.org/give' },
    });
    assert.equal(parsed.socials?.[0]?.url, 'http://example.org/a');
    assert.equal(parsed.giving?.url, 'https://example.org/give');
  });
});

describe('stored → DTO projection', () => {
  test('the default blob projects every section without internal keys', () => {
    const publicDto = toPublicDto(readStored(null));
    assert.deepEqual(Object.keys(publicDto).sort(), [
      'church',
      'giving',
      'schedule',
      'socials',
    ]);
    assert.deepEqual(publicDto.church, {
      name: 'Iglesia UCI',
      shortDescription:
        'Una comunidad que busca a Dios, vive Su Palabra y permanece en oración.',
      address: 'Dirección por confirmar',
      city: 'Villavicencio',
      state: 'Meta',
      phone: null,
      email: null,
      whatsapp: null,
    });
    assert.equal(publicDto.schedule.length, 2);
    assert.equal(publicDto.socials.length, 3);
    assert.ok(publicDto.socials.every((social) => social.url === null));
    assert.equal(publicDto.giving.url, null);
  });

  test('unconfigured church text is omitted from the public DTO but kept in admin', () => {
    const stored = readStored({
      church: {
        name: 'Iglesia UCI',
        shortDescription: 'Comunidad',
        address: '',
        city: null,
        state: '   ',
      },
    });
    const publicChurch = toPublicDto(stored).church;
    assert.deepEqual(publicChurch, {
      name: 'Iglesia UCI',
      shortDescription: 'Comunidad',
      phone: null,
      email: null,
      whatsapp: null,
    });
    assert.equal('address' in publicChurch, false);
    assert.equal(publicChurch.phone, null);
    assert.equal(publicChurch.email, null);
    assert.equal(publicChurch.whatsapp, null);
    assert.equal(toAdminDto(stored).church.address, null);
    assert.equal(toAdminDto(stored).church.city, null);
    assert.equal(toAdminDto(stored).church.state, null);
  });

  test('public contact fields are explicit null when not configured', () => {
    const publicChurch = toPublicDto(readStored(null)).church;
    assert.equal(publicChurch.phone, null);
    assert.equal(publicChurch.email, null);
    assert.equal(publicChurch.whatsapp, null);

    const configured = toPublicDto(
      readStored({
        church: {
          name: 'Iglesia UCI',
          shortDescription: 'Comunidad',
          phone: '+57 300 111 2233',
          email: 'hola@uci.example.org',
          whatsapp: '+57 300 111 2233',
        },
      }),
    ).church;
    assert.equal(configured.phone, '+57 300 111 2233');
    assert.equal(configured.email, 'hola@uci.example.org');
    assert.equal(configured.whatsapp, '+57 300 111 2233');
  });

  test('malformed stored entries are dropped, never published', () => {
    const stored = readStored({
      schedule: [
        { name: 'Valid', dayOfWeek: 1, startTime: '18:00', endTime: null, active: true },
        { name: '', dayOfWeek: 1, startTime: '18:00', active: true },
        { name: 'Bad day', dayOfWeek: 9, startTime: '18:00', active: true },
        { name: 'Bad time', dayOfWeek: 1, startTime: '99:99', active: true },
      ],
      socials: [
        { platform: 'youtube', label: 'YouTube', url: 'https://youtube.com/@uci' },
        { platform: 'youtube', label: 'Broken', url: 'javascript:alert(1)' },
        { platform: '', label: 'No platform', url: null },
      ],
    });
    assert.deepEqual(stored.schedule, [
      { name: 'Valid', dayOfWeek: 1, startTime: '18:00', endTime: null, active: true },
    ]);
    // A non-http URL is stored as "not configured" rather than leaked verbatim.
    assert.deepEqual(stored.socials, [
      { platform: 'youtube', label: 'YouTube', url: 'https://youtube.com/@uci' },
      { platform: 'youtube', label: 'Broken', url: null },
    ]);
  });

  test('a corrupted persisted value falls back to defaults instead of throwing', () => {
    for (const value of [null, 'oops', 42, [], { church: 'bad' }]) {
      const stored = readStored(value as never);
      assert.equal(stored.church.name, DEFAULT_PUBLIC_SETTINGS.church.name);
      assert.equal(stored.schedule.length, 2);
    }
  });
});
