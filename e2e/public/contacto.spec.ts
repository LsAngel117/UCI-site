/**
 * Public site — contact form smoke test (Lote C).
 *
 * Asserts the page and its form are reachable with every control exposed to
 * assistive technology through its visible label. It never submits the form:
 * that would create a real contact submission row during a read-only suite.
 */
import { expect, test } from '@playwright/test';

test.describe('contact page', () => {
  test('shows the accessible contact form', async ({ page }) => {
    const response = await page.goto('/contacto');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Contacto' })).toBeVisible();
    await expect(page.locator('#contact-form')).toBeVisible();
    await expect(page.getByLabel(/Nombre/)).toBeVisible();
    await expect(page.getByLabel(/Correo electrónico/)).toBeVisible();
    await expect(page.getByLabel(/Mensaje/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Enviar mensaje' }),
    ).toBeVisible();
  });
});
