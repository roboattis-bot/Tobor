import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { buildServer } from '../server/app';

test('production cookies support an explicit HTTP LAN deployment and retain a secure default', async () => {
  const root = resolve('.tools/test-runs');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(resolve(root, 'deployment-'));
  const previousMode = process.env.NODE_ENV;
  const previousSecure = process.env.COOKIE_SECURE;
  process.env.NODE_ENV = 'production';
  try {
    for (const setting of ['false', 'true', undefined]) {
      if (setting === undefined) delete process.env.COOKIE_SECURE;
      else process.env.COOKIE_SECURE = setting;
      const app = await buildServer({
        databasePath: ':memory:',
        uploadDir: directory,
        demo: false,
        logger: false,
        serveStatic: false,
      });
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/setup',
          payload: {
            name: 'LAN test operator',
            email: 'lan-test@example.test',
            password: 'A private LAN test password',
          },
        });
        assert.equal(response.statusCode, 201);
        const cookie = response.cookies.find((cookie) => cookie.name === 'tobor_session');
        assert.ok(cookie);
        assert.equal(Boolean(cookie.secure), setting !== 'false');
        assert.equal(cookie.httpOnly, true);
        assert.equal(cookie.sameSite, 'Strict');
      } finally {
        await app.close();
      }
    }
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
    if (previousSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = previousSecure;
    assert.ok(resolve(directory).startsWith(root + sep));
    rmSync(directory, { recursive: true, force: true });
  }
});
