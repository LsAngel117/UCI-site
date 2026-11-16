/**
 * Public site — browser structural accessibility checks (Lote C).
 *
 * These are cheap, meaningful invariants from docs/13 §18.8 that do not need
 * an external engine: a language, one page-level heading, main landmark,
 * alternative text on every image and an accessible name on every link.
 *
 * A full automated audit (axe-core) is intentionally out of scope here: adding
 * another runtime dependency was not required for the Lote C acceptance
 * criteria. The existing `tests/a11y-static.test.ts` covers the static markup.
 */
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/sermones', '/contacto'] as const;

for (const path of PAGES) {
  test(`structural accessibility on ${path}`, async ({ page }) => {
    await page.goto(path);

    const issues = await page.evaluate(() => {
      const problems: string[] = [];
      const root = document.documentElement;

      if (!root.getAttribute('lang')?.trim()) {
        problems.push('the html element has no lang attribute');
      }

      const headings = document.querySelectorAll('h1');
      if (headings.length !== 1) {
        problems.push(`expected exactly one h1, found ${headings.length}`);
      }

      if (!document.querySelector('main')) {
        problems.push('missing main landmark');
      }

      document.querySelectorAll('img').forEach((image, index) => {
        if (!image.hasAttribute('alt')) {
          problems.push(`img #${index + 1} (${image.getAttribute('src') ?? 'no src'}) has no alt attribute`);
        }
      });

      document.querySelectorAll('a[href]').forEach((anchor, index) => {
        const name =
          anchor.getAttribute('aria-label')?.trim() ||
          anchor.textContent?.trim() ||
          '';
        if (!name) {
          problems.push(`link #${index + 1} (${anchor.getAttribute('href') ?? 'no href'}) has no accessible name`);
        }
      });

      return problems;
    });

    expect(issues).toEqual([]);
  });
}
