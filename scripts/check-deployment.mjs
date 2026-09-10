import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const input = process.argv[2];
if (!input) throw new Error('Usage: npm run check:deployment -- http://server:3001');
const origin = new URL(input).origin;
const testEmail = process.argv[3];
if (!['http:', 'https:'].includes(new URL(origin).protocol))
  throw new Error('Use an HTTP or HTTPS application URL.');
const read = (path) => fetch(`${origin}${path}`, { signal: AbortSignal.timeout(15_000) });

const health = await read('/api/health');
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { ok: true, service: 'tobor-api' });
const account = await read('/api/auth/me');
assert.equal(account.status, 200);
const auth = await account.json();
assert.equal(auth.user, null);
assert.equal(auth.needsSetup, false);
assert.equal(typeof auth.testLoginEnabled, 'boolean');
if (testEmail)
  assert.equal(
    auth.testLoginEnabled,
    true,
    'Explicit test access must be enabled before checking arbitrary-password login.',
  );
assert.equal((await read('/api/dashboard')).status, 401);

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
      });
      const response = await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
      assert.equal(response?.status(), 200);
      await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
      assert.equal(
        await page.locator('.test-access-banner').count(),
        auth.testLoginEnabled ? 1 : 0,
      );
      assert.equal(
        await page.getByLabel('Password', { exact: true }).getAttribute('type'),
        'password',
      );
      if (name === 'desktop') await page.locator('.auth-story .printer-scene').waitFor();
      await page.locator('.model-canvas[data-status="ready"]').waitFor();
      assert.equal(await page.locator('canvas').count(), 1, '3D views share one renderer');
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      );
      assert.equal(fits, true, `${name} login must fit the viewport`);
      await page.screenshot({ path: `test-results/tobor-pi-login-${name}.png`, fullPage: true });
      console.log(`${name}: login, assets and viewport passed`);
      if (testEmail) {
        await page.getByLabel('Email address', { exact: true }).fill(testEmail);
        await page.getByLabel('Password', { exact: true }).fill('test');
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await page.getByText('Workspace connected', { exact: true }).waitFor();
        await page
          .getByRole('heading', { name: 'What needs to happen next?', exact: true })
          .waitFor();
        await page.locator('.welcome-art [data-model-ready="true"]').waitFor();
        assert.match(await page.locator('.test-access-banner').innerText(), /Test access enabled/);
        const dashboardFits = await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        );
        assert.equal(dashboardFits, true, `${name} dashboard must fit the viewport`);
        await page.screenshot({
          path: `test-results/tobor-pi-test-dashboard-${name}.png`,
          fullPage: true,
        });
        await page.getByRole('button', { name: 'New request', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Start a new request', exact: true });
        await dialog.getByLabel('Request title', { exact: true }).waitFor();
        await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
        if (name === 'mobile')
          await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
        assert.equal((await context.request.get(`${origin}/api/dashboard`)).status(), 401);
        console.log(`${name}: arbitrary-password entry, dashboard and logout passed`);
      }
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
console.log(
  `Deployment verified at ${origin}; administrator setup preserved and private API protected.`,
);
