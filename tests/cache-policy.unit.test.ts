/**
 * Phase 12C — cache policy primitives (docs/15 §18.9).
 *
 * The public site and the API/panel are separate runtimes. They share one
 * policy module so HTML is always revalidated, hashed assets are immutable and
 * private API responses are never stored by a shared cache.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CACHE_CONTROL,
  applyCacheControl,
  cacheControlFor,
} from '@shared/cache';

describe('cache-control policy', () => {
  test('HTML documents are always revalidated', () => {
    assert.equal(
      cacheControlFor({
        pathname: '/sermones',
        contentType: 'text/html; charset=utf-8',
      }),
      CACHE_CONTROL.HTML,
    );
    assert.equal(
      cacheControlFor({ pathname: '/', contentType: 'text/html' }),
      CACHE_CONTROL.HTML,
    );
  });

  test('hashed build assets are immutable', () => {
    for (const pathname of [
      '/_astro/index.CqXyAzXc.css',
      '/panel/assets/index-p6P8d8Wy.js',
      '/favicon.svg',
    ]) {
      assert.equal(
        cacheControlFor({ pathname, contentType: 'text/css' }),
        CACHE_CONTROL.STATIC,
        pathname,
      );
    }
  });

  test('public media gets an explicit shared-cache window', () => {
    assert.equal(
      cacheControlFor({
        pathname: '/media/sermons/2026/01/abc.webp',
        contentType: 'image/webp',
      }),
      CACHE_CONTROL.MEDIA,
    );
  });

  test('API responses are never stored by a shared cache', () => {
    for (const pathname of [
      '/api/v1/auth/me',
      '/api/v1/admin/media',
      '/api/v1/settings/public',
      '/api/contact',
    ]) {
      assert.equal(
        cacheControlFor({ pathname, contentType: 'application/json' }),
        CACHE_CONTROL.API,
        pathname,
      );
    }
  });

  test('discovery documents keep their own public windows', () => {
    assert.equal(
      cacheControlFor({ pathname: '/sitemap.xml', contentType: 'application/xml' }),
      CACHE_CONTROL.SITEMAP,
    );
    assert.equal(
      cacheControlFor({ pathname: '/robots.txt', contentType: 'text/plain' }),
      CACHE_CONTROL.ROBOTS,
    );
  });

  test('unknown binary responses are left untouched', () => {
    assert.equal(
      cacheControlFor({ pathname: '/download.bin', contentType: 'application/octet-stream' }),
      null,
    );
  });

  test('applyCacheControl never overwrites a route decision', () => {
    const headers = new Headers({ 'cache-control': 'private, max-age=10' });
    applyCacheControl(headers, {
      pathname: '/',
      contentType: 'text/html',
    });
    assert.equal(headers.get('cache-control'), 'private, max-age=10');
  });

  test('applyCacheControl stamps the policy when absent', () => {
    const headers = new Headers();
    applyCacheControl(headers, {
      pathname: '/api/v1/admin/users',
      contentType: 'application/json',
    });
    assert.equal(headers.get('cache-control'), CACHE_CONTROL.API);
  });
});
