/**
 * Admin panel — authentication (Lote C).
 *
 * Exercises the real cookie-based login: the form posts to the same-origin
 * `/api/v1/auth/login`, the HttpOnly cookie is set by the API, `/auth/me`
 * confirms the session and the authenticated shell renders. Logout revokes the
 * session and returns to the login screen.
 */
import { expect, test } from '@playwright/test';
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from '../support/env';

test.describe('panel authentication', () => {
  test('renders the login form with labelled controls', async ({ page }) => {
    const response = await page.goto('/panel/login');

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Iniciar sesión' }),
    ).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Iniciar sesión' }),
    ).toBeEnabled();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });

  test('signs in with the test admin and signs out again', async ({ page }) => {
    await page.goto('/panel/login');

    await page.getByLabel('Correo electrónico').fill(E2E_ADMIN_EMAIL);
    await page.getByLabel('Contraseña').fill(E2E_ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page).toHaveURL(/\/panel\/?$/);
    await expect(
      page.getByRole('heading', { level: 1, name: /Bienvenido/ }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await expect(page).toHaveURL(/\/panel\/login$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Iniciar sesión' }),
    ).toBeVisible();
  });
});
