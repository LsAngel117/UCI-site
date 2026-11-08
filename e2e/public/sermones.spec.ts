/**
 * Public site — sermon archive smoke test (Lote C).
 *
 * The archive is SSR and always renders its shell (hero + accessible filters),
 * even when there are no published sermons. Content itself is covered by the
 * editorial flow test, which publishes a real sermon through the API.
 */
import { expect, test } from '@playwright/test';

test.describe('sermon archive', () => {
  test('lists sermons with the filter form', async ({ page }) => {
    const response = await page.goto('/sermones');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Sermones' })).toBeVisible();
    await expect(
      page.getByRole('search', { name: 'Filtrar sermones' }),
    ).toBeVisible();
    await expect(page.getByLabel('Buscar')).toBeVisible();
  });
});
