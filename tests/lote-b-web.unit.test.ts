/**
 * Improvement Lote B — public web pure helpers.
 *
 * Pins the B1 configurable-timezone formatting and the B3 promise that a bare
 * block array (the sermon rich body) is normalized by the same safe page
 * renderer as CMS pages.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  DEFAULT_CHURCH_TIME_ZONE,
  formatEventDay,
  formatEventDateTime,
  formatEventTime,
  formatServiceDay,
  formatTime12h,
  formatWeekdayDate,
  resolveChurchTimeZone,
} from '@web/lib/format';
import { normalizePageContent } from '@web/lib/page-content';

const INSTANT = '2026-01-15T02:30:00.000Z';

describe('B1 — church timezone formatting', () => {
  test('uses the configured IANA zone instead of hardcoding Bogota', () => {
    assert.equal(formatEventDay(INSTANT, 'America/Bogota'), '14');
    assert.equal(formatEventDay(INSTANT, 'Europe/Madrid'), '15');
    assert.equal(formatEventTime(INSTANT, 'America/Bogota'), '21:30');
    assert.equal(formatEventTime(INSTANT, 'Europe/Madrid'), '03:30');
    assert.match(
      formatEventDateTime(INSTANT, 'Europe/Madrid') ?? '',
      /^15 de enero de 2026/,
    );
    assert.match(
      formatWeekdayDate(INSTANT, 'Europe/Madrid') ?? '',
      /^Jueves, 15 de enero$/,
    );
  });

  test('missing or invalid timezones fall back to the documented default', () => {
    assert.equal(resolveChurchTimeZone(undefined), DEFAULT_CHURCH_TIME_ZONE);
    assert.equal(resolveChurchTimeZone('   '), DEFAULT_CHURCH_TIME_ZONE);
    assert.equal(resolveChurchTimeZone('Not/AZone'), DEFAULT_CHURCH_TIME_ZONE);
    assert.equal(resolveChurchTimeZone('America/Lima'), 'America/Lima');
    assert.equal(
      formatEventDay(INSTANT),
      formatEventDay(INSTANT, DEFAULT_CHURCH_TIME_ZONE),
    );
  });
});

describe('hero service strip formatting', () => {
  test('renders stored 24h times as 12h labels', () => {
    assert.equal(formatTime12h('09:00'), '09:00 AM');
    assert.equal(formatTime12h('13:05'), '01:05 PM');
    assert.equal(formatTime12h('00:30'), '12:30 AM');
    assert.equal(formatTime12h('12:00'), '12:00 PM');
    assert.equal(formatTime12h('Por confirmar'), 'Por confirmar');
    assert.equal(formatTime12h(null), null);
  });

  test('renders plural weekday labels and rejects unknown days', () => {
    assert.equal(formatServiceDay(0), 'DOMINGOS');
    assert.equal(formatServiceDay(1), 'LUNES');
    assert.equal(formatServiceDay(6), 'SÁBADOS');
    assert.equal(formatServiceDay(undefined), null);
    assert.equal(formatServiceDay(9), null);
  });
});

describe('B3 — sermon blocks use the safe page renderer', () => {
  test('a bare blocks array is normalized exactly like a page body', () => {
    const blocks = normalizePageContent([
      { type: 'heading', text: ' Introducción ', level: 3 },
      { type: 'paragraph', text: 'Primer párrafo.' },
      { type: 'list', ordered: true, items: ['Uno', 'Dos'] },
      { type: 'quote', text: 'Cita', cite: 'Referencia' },
      { type: 'cta', label: 'Conócenos', href: '/nosotros' },
      { type: 'image', src: '/media/foto.jpg', alt: 'Foto' },
    ]);

    assert.deepEqual(blocks, [
      { type: 'heading', level: 3, text: 'Introducción' },
      { type: 'paragraph', text: 'Primer párrafo.' },
      { type: 'list', ordered: true, items: ['Uno', 'Dos'] },
      { type: 'quote', text: 'Cita', cite: 'Referencia' },
      { type: 'cta', label: 'Conócenos', href: '/nosotros', external: false },
      { type: 'image', src: '/media/foto.jpg', alt: 'Foto' },
    ]);
  });

  test('unsafe URLs and unknown block types are dropped from an array body', () => {
    const blocks = normalizePageContent([
      { type: 'cta', label: 'Malicioso', href: 'javascript:alert(1)' },
      { type: 'image', src: 'data:image/svg+xml,<svg/>', alt: 'x' },
      { type: 'html', html: '<script>alert(1)</script>' },
      { type: 'paragraph', text: 'Contenido real.' },
    ]);
    assert.deepEqual(blocks, [{ type: 'paragraph', text: 'Contenido real.' }]);
  });
});
