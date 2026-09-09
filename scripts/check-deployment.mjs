import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const input = process.argv[2];
if (!input) throw new Error('Usage: npm run check:deployment -- http://server:3001');
const origin = new URL(input).origin;
if (!['http:', 'https:'].includes(new URL(origin).protocol))
  throw new Error('Use an HTTP or HTTPS application URL.');
const read = (path) => fetch(`${origin}${path}`, { signal: AbortSignal.timeout(15_000) });

const health = await read('/api/health');
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { ok: true, service: 'tobor-api' });
const account = await read('/api/auth/me');
assert.equal(account.status, 200);
assert.deepEqual(await account.json(), { user: null, needsSetup: false });
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
        await page.getByLabel('Password', { exact: true }).getAttribute('type'),
        'password',
      );
      if (name === 'desktop')
        await page
          .locator('.auth-story .printer-scene canvas, .auth-story .printer-fallback')
          .waitFor();
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      );
      assert.equal(fits, true, `${name} login must fit the viewport`);
      await page.screenshot({ path: `test-results/tobor-pi-login-${name}.png`, fullPage: true });
      console.log(`${name}: login, assets and viewport passed`);
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
