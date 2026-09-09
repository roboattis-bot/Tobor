import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildServer } from '../server/app';

test('test login is explicit, scoped to one account, and revoked when disabled', async () => {
  const root = resolve('.tools/test-runs');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(resolve(root, 'test-login-'));
  const databasePath = resolve(directory, 'workspace.sqlite');
  const email = 'test-access@example.test';
  const password = 'The saved password still works!';
  const previous = process.env.TEST_LOGIN_EMAIL;
  const makeApp = () =>
    buildServer({
      databasePath,
      uploadDir: directory,
      demo: false,
      logger: false,
      serveStatic: false,
    });
  const login = (app: Awaited<ReturnType<typeof makeApp>>, accountEmail: string, value: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: accountEmail, password: value },
    });
  let app: Awaited<ReturnType<typeof makeApp>> | undefined;
  try {
    delete process.env.TEST_LOGIN_EMAIL;
    app = await makeApp();
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/setup',
          payload: { name: 'Test operator', email, password },
        })
      ).statusCode,
      201,
    );
    assert.equal((await login(app, email, 'x')).statusCode, 401);
    assert.equal((await app.inject('/api/auth/me')).json().testLoginEnabled, false);
    await app.close();
    app = undefined;
    const db = new DatabaseSync(databasePath);
    try {
      db.prepare(
        'INSERT INTO users(name, email, password_hash, role, created_at) SELECT ?, ?, password_hash, role, created_at FROM users WHERE email = ?',
      ).run('Another operator', 'other@example.test', email);
    } finally {
      db.close();
    }

    process.env.TEST_LOGIN_EMAIL = 'TEST-ACCESS@EXAMPLE.TEST';
    app = await makeApp();
    assert.equal((await app.inject('/api/auth/me')).json().testLoginEnabled, true);
    const entered = await login(app, email, 'x');
    assert.equal(entered.statusCode, 200);
    const cookie = entered.headers['set-cookie']!.toString().split(';')[0];
    assert.equal(
      (await app.inject({ url: '/api/dashboard', headers: { cookie } })).statusCode,
      200,
    );
    assert.equal((await login(app, email, 'another random value')).statusCode, 200);
    assert.equal((await login(app, 'other@example.test', 'x')).statusCode, 401);
    assert.equal((await login(app, 'missing@example.test', 'x')).statusCode, 401);
    assert.equal((await login(app, email, '')).statusCode, 400);
    await app.close();
    app = undefined;

    delete process.env.TEST_LOGIN_EMAIL;
    app = await makeApp();
    assert.equal(
      (await app.inject({ url: '/api/dashboard', headers: { cookie } })).statusCode,
      401,
    );
    assert.equal((await login(app, email, 'x')).statusCode, 401);
    assert.equal((await login(app, email, password)).statusCode, 200);
  } finally {
    await app?.close();
    if (previous === undefined) delete process.env.TEST_LOGIN_EMAIL;
    else process.env.TEST_LOGIN_EMAIL = previous;
    assert.ok(resolve(directory).startsWith(root + sep));
    rmSync(directory, { recursive: true, force: true });
  }
});
