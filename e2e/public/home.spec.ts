/**
 * Public site — homepage smoke test (Lote C).
 *
 * Proves the SSR homepage renders through the real stack (Astro → API) with
 * its title, a single visible hero heading and the site navigation.
 */
import { expect, test } from '@playwright/test';

test.describe('public homepage', () => {
  test('renders the church hero and navigation', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Iglesia UCI/i);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('header').first()).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
  });
});
