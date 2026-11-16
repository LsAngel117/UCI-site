/**
 * Phase 12C — client JavaScript and bundle regression guards (docs/15 §18.9).
 *
 * The public site is server-rendered and must not ship framework islands. The
 * admin panel is a single SPA bundle; these budgets document its current size
 * and fail if an accidental dependency doubles it.
 *
 * Build-dependent checks are skipped when `dist/` is absent; the source-level
 * island guard always runs.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLIENT_DIST = join(ROOT, 'dist/client');
const ADMIN_ASSETS = join(ROOT, 'dist/admin/assets');
const HAS_SITE_BUILD = existsSync(CLIENT_DIST);
const HAS_ADMIN_BUILD = existsSync(ADMIN_ASSETS);

const ADMIN_JS_BUDGET_BYTES = 600 * 1024;
const ADMIN_CSS_BUDGET_BYTES = 80 * 1024;

function listFiles(
  directory: string,
  predicate: (name: string) => boolean,
): string[] {
  return readdirSync(directory)
    .filter(predicate)
    .map((name) => join(directory, name));
}

function listFilesRecursive(
  directory: string,
  predicate: (name: string) => boolean,
): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFilesRecursive(path, predicate));
    } else if (predicate(entry.name)) {
      result.push(path);
    }
  }
  return result;
}

describe('public client JavaScript', () => {
  test('the public source declares no client islands', () => {
    const offenders: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.(astro|ts|tsx)$/.test(entry.name)) continue;
        const source = readFileSync(path, 'utf8');
        if (/\bclient:(load|idle|visible|only|media|listen)\b/.test(source)) {
          offenders.push(path.slice(ROOT.length));
        }
      }
    };
    walk(join(ROOT, 'src/web'));
    assert.deepEqual(offenders, [], 'Astro islands would ship unnecessary JS');
  });

  test(
    'the public build ships no JavaScript assets',
    { skip: HAS_SITE_BUILD ? false : 'dist/client build is absent' },
    () => {
      const jsFiles = listFilesRecursive(CLIENT_DIST, (name) =>
        name.endsWith('.js'),
      );
      assert.deepEqual(jsFiles, [], 'the SSR site must not emit client JS');
    },
  );
});

describe('admin bundle budget', () => {
  test(
    'the SPA JavaScript stays under the documented budget',
    { skip: HAS_ADMIN_BUILD ? false : 'dist/admin build is absent' },
    () => {
      const jsFiles = listFiles(ADMIN_ASSETS, (name) => name.endsWith('.js'));
      assert.equal(jsFiles.length, 1, 'the panel emits one entry bundle');
      const bytes = statSync(jsFiles[0]!).size;
      assert.ok(
        bytes <= ADMIN_JS_BUDGET_BYTES,
        `admin JS is ${bytes} bytes (budget ${ADMIN_JS_BUDGET_BYTES})`,
      );
    },
  );

  test(
    'the admin stylesheet stays under the documented budget',
    { skip: HAS_ADMIN_BUILD ? false : 'dist/admin build is absent' },
    () => {
      const cssFiles = listFiles(ADMIN_ASSETS, (name) => name.endsWith('.css'));
      assert.equal(cssFiles.length, 1, 'the panel emits one stylesheet');
      const bytes = statSync(cssFiles[0]!).size;
      assert.ok(
        bytes <= ADMIN_CSS_BUDGET_BYTES,
        `admin CSS is ${bytes} bytes (budget ${ADMIN_CSS_BUDGET_BYTES})`,
      );
    },
  );
});
