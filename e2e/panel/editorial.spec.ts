/**
 * Admin panel — editorial flow (Lote C, docs/15 §18.3).
 *
 * Creates a real sermon through the authenticated admin API, proves a draft is
 * NOT publicly visible, publishes it, and verifies the published detail and
 * archive entry render on the public Astro site. The sermon is archived at the
 * end; the global teardown hard-deletes it.
 *
 * Using the API for the mutation keeps the test focused on the integration
 * contract (auth → CMS → public rendering) rather than on editor form layout,
 * which the panel unit suites already cover.
 */
import { expect, test } from '@playwright/test';
import {
  API_BASE_URL,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_SERMON_SLUG_PREFIX,
  PUBLIC_BASE_URL,
  runId,
} from '../support/env';

interface CreatedSermon {
  data: { id: string; slug: string; status: string };
}

test.describe('editorial flow', () => {
  test('publishes a sermon and renders it on the public site', async ({
    page,
    request,
  }) => {
    const id = runId();
    const slug = `${E2E_SERMON_SLUG_PREFIX}${id}`;
    const title = `Sermón E2E ${id}`;
    const description = `Predicación creada por la suite E2E (${id}).`;

    const login = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: { email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD },
    });
    if (!login.ok()) {
      throw new Error(
        `API login failed: ${login.status()} ${await login.text()}`,
      );
    }

    const created = await request.post(`${API_BASE_URL}/api/v1/admin/sermons`, {
      data: {
        title,
        slug,
        description,
        sermonDate: new Date().toISOString(),
      },
    });
    if (created.status() !== 201) {
      throw new Error(`sermon create failed: ${created.status()} ${await created.text()}`);
    }
    const sermon = (await created.json()) as CreatedSermon;
    expect(sermon.data.status).toBe('draft');

    // A draft must never leak into the public site.
    const draftPage = await page.goto(`${PUBLIC_BASE_URL}/sermones/${slug}`);
    expect(draftPage?.status()).toBe(404);

    const published = await request.post(
      `${API_BASE_URL}/api/v1/admin/sermons/${sermon.data.id}/publish`,
    );
    if (!published.ok()) {
      throw new Error(`publish failed: ${published.status()} ${await published.text()}`);
    }
    expect(((await published.json()) as CreatedSermon).data.status).toBe('published');

    const detail = await page.goto(`${PUBLIC_BASE_URL}/sermones/${slug}`);
    expect(detail?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
    await expect(page.getByText(description)).toBeVisible();

    await page.goto(`${PUBLIC_BASE_URL}/sermones`);
    await expect(page.getByRole('link', { name: title }).first()).toBeVisible();

    const archived = await request.post(
      `${API_BASE_URL}/api/v1/admin/sermons/${sermon.data.id}/archive`,
    );
    expect(archived.ok()).toBeTruthy();

    // Archiving removes it from the public detail route as well.
    const archivedPage = await page.goto(`${PUBLIC_BASE_URL}/sermones/${slug}`);
    expect(archivedPage?.status()).toBe(404);
  });
});
