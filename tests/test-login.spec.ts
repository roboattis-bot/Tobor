import { expect, test } from '@playwright/test';

test('any password opens the configured test account and testing mode stays visible after logout', async ({
  page,
  request,
}) => {
  const email = process.env.E2E_TEST_LOGIN_EMAIL!;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const setup = await request.post('/api/auth/setup', {
    data: { name: 'Test Operator', email, password: 'A separate saved account password' },
  });
  expect(setup.status()).toBe(201);
  await request.post('/api/auth/logout');
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.test-access-banner')).toContainText('any password');
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('x');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Workspace connected', { exact: true })).toBeVisible();
    await expect(page.locator('.test-access-banner')).toContainText('Test access enabled');
    await page.reload();
    await expect(page.getByText('Workspace connected', { exact: true })).toBeVisible();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(fits).toBe(true);
    if (viewport.width < 600)
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible();
    await expect(page.locator('.test-access-banner')).toContainText('any password');
  }
  expect(errors).toEqual([]);
});
