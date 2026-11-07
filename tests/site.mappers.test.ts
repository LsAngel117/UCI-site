/**
 * Phase 9A corrections — pure settings → domain mapper suite.
 *
 * The public homepage must degrade honestly: the structural fixture is a
 * fallback ONLY when the API is unavailable (`settings === null` /
 * navigation `null`). When settings are present, a field the admin cleared is
 * rendered empty, never replaced by an old fixture value. This suite pins that
 * contract without loading Astro assets or the network.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildChurchProfile,
  buildGivingConfig,
  buildServiceSchedules,
  buildSiteNavigation,
} from '../src/web/data/mappers';
import { churchProfileFixture } from '../src/web/data/fixtures/church';
import type { PublicChurchDto, PublicSettingsDto } from '@shared/settings';

function church(overrides: Partial<PublicChurchDto> = {}): PublicChurchDto {
  return {
    name: 'Iglesia UCI',
    shortDescription: 'Una comunidad',
    phone: null,
    email: null,
    whatsapp: null,
    ...overrides,
  };
}

function settings(overrides: Partial<PublicSettingsDto> = {}): PublicSettingsDto {
  return {
    church: church(),
    schedule: [],
    socials: [],
    giving: {
      title: 'UNA IGLESIA GENEROSA',
      message: 'Mensaje',
      ctaLabel: 'QUIERO DAR',
      url: null,
    },
    ...overrides,
  };
}

describe('buildChurchProfile', () => {
  test('cleared location fields stay empty and never reuse fixture values', () => {
    const profile = buildChurchProfile(
      settings({
        // The public DTO omits unconfigured address fields entirely.
        church: church({ address: undefined, city: undefined, state: undefined }),
      }),
    );

    // The fixture itself still carries the honest placeholder city/state; that
    // is exactly what must NOT leak while settings are present.
    assert.equal(churchProfileFixture.location.city, 'Villavicencio');

    assert.equal(profile.location.address, '');
    assert.equal(profile.location.city, '');
    assert.equal(profile.location.state, '');
    assert.equal(profile.location.mapUrl, '');
    assert.equal(profile.location.confirmed, false);
  });

  test('a blank placeholder address is never treated as confirmed', () => {
    const profile = buildChurchProfile(
      settings({ church: church({ address: 'Dirección por confirmar', city: 'Villavicencio' }) }),
    );
    assert.equal(profile.location.confirmed, false);
    assert.equal(profile.location.mapUrl, '');
  });

  test('configured address produces a confirmed, routed location', () => {
    const profile = buildChurchProfile(
      settings({ church: church({ address: 'Calle 1 #2-3', city: 'Villavicencio' }) }),
    );
    assert.equal(profile.location.confirmed, true);
    assert.match(profile.location.mapUrl, /^https:\/\/www\.google\.com\/maps\/search/);
  });

  test('contact comes from settings and cleared contact stays empty', () => {
    const cleared = buildChurchProfile(settings());
    assert.equal(cleared.phone, '');
    assert.equal(cleared.email, '');
    assert.equal(cleared.whatsapp, '');
    assert.deepEqual(cleared.socialLinks, []);

    const configured = buildChurchProfile(
      settings({
        church: church({
          phone: '+57 300 111 2233',
          email: 'hola@uci.example.org',
          whatsapp: '+57 300 111 2233',
        }),
        socials: [
          { platform: 'instagram', label: 'Instagram', url: 'https://instagram.com/uci' },
          { platform: 'facebook', label: 'Facebook', url: null },
        ],
      }),
    );

    assert.equal(configured.phone, '+57 300 111 2233');
    assert.equal(configured.email, 'hola@uci.example.org');
    assert.equal(configured.whatsapp, '+57 300 111 2233');
    assert.deepEqual(configured.socialLinks, [
      { platform: 'instagram', label: 'Instagram', url: 'https://instagram.com/uci' },
    ]);
  });

  test('no settings falls back to a structural profile without fictitious contact', () => {
    const fallback = buildChurchProfile(null);
    assert.equal(fallback.name, 'Iglesia UCI');
    assert.equal(fallback.phone, '');
    assert.equal(fallback.email, '');
    assert.equal(fallback.whatsapp, '');
    assert.deepEqual(fallback.socialLinks, []);
    assert.equal(fallback.location.name, '');
  });
});

describe('buildServiceSchedules / buildGivingConfig', () => {
  test('an empty configured schedule stays empty instead of using a fixture', () => {
    assert.deepEqual(buildServiceSchedules(settings({ schedule: [] })), []);
    assert.deepEqual(buildServiceSchedules(null), []);
  });

  test('giving copy comes from settings, including a cleared URL', () => {
    const giving = {
      title: 'Dar',
      message: 'Mensaje',
      ctaLabel: 'Dar ahora',
      url: null,
    };
    assert.deepEqual(buildGivingConfig(settings({ giving })), giving);
  });
});

describe('buildSiteNavigation', () => {
  test('an empty CMS menu is respected and does not fall back to the static menu', () => {
    const empty = buildSiteNavigation([], []);
    assert.deepEqual(empty.primary, []);
    assert.deepEqual(empty.footer, []);
  });

  test('unavailable navigation (null) uses the approved structural menu', () => {
    const fallback = buildSiteNavigation(null, null);
    assert.ok(fallback.primary.length > 0);
    assert.ok(fallback.footer.length > 0);
  });

  test('a header menu is used verbatim while an empty footer stays empty', () => {
    const header = [
      {
        id: 'inicio',
        label: 'Inicio',
        href: '/',
        external: false,
        target: null,
        children: [],
      },
    ];
    const nav = buildSiteNavigation(header, []);
    assert.deepEqual(
      nav.primary.map((item) => item.href),
      ['/'],
    );
    assert.deepEqual(nav.footer, []);
  });
});
