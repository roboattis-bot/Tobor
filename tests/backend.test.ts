import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildServer } from '../server/app';
import type { CaseRecord, DashboardData, QualityCheck, Quote } from '../shared/types';

const testRoot = resolve('.tools/test-runs');
mkdirSync(testRoot, { recursive: true });
const credentials = {
  name: 'Workshop Owner',
  email: 'owner@example.com',
  password: 'A strong workshop password 2026!',
};
async function fixture(demo = false) {
  const directory = mkdtempSync(resolve(testRoot, 'api-'));
  const databasePath = resolve(directory, 'test.sqlite');
  const uploadDir = resolve(directory, 'uploads');
  const app = await buildServer({
    databasePath,
    uploadDir,
    demo,
    logger: false,
    serveStatic: false,
  });
  const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: credentials });
  assert.equal(setup.statusCode, 201, setup.body);
  const session = setup.cookies.find((c) => c.name === 'tobor_session')!.value;
  const headers = { cookie: `tobor_session=${session}` };
  const call = (method: InjectOptions['method'], url: string, payload?: object) =>
    app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
  return {
    app,
    call,
    headers,
    directory,
    databasePath,
    uploadDir,
    async close() {
      await app.close();
      const target = resolve(directory);
      assert.ok(target.startsWith(`${testRoot}${sep}`));
      rmSync(target, { recursive: true, force: true });
    },
  };
}
async function newCase(
  f: Awaited<ReturnType<typeof fixture>>,
  extra: object = {},
): Promise<CaseRecord> {
  const response = await f.call('POST', '/api/cases', {
    title: 'Sensor mounting bracket',
    customer: 'Test engineering lab',
    intendedUse: 'Noncritical indoor sensor support',
    dimensions: '80 x 45 x 12 mm, interface measured',
    risk: 'low',
    ...extra,
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}
async function quote(f: Awaited<ReturnType<typeof fixture>>, caseId: number): Promise<Quote> {
  const expiry = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const response = await f.call('POST', '/api/quotes', {
    caseId,
    engineering: 1500,
    manufacturing: 2500,
    testing: 500,
    shipping: 100,
    taxRate: 18,
    expiresAt: expiry,
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}
async function transition(
  f: Awaited<ReturnType<typeof fixture>>,
  id: number,
  status: string,
  expected = 200,
) {
  const result = await f.call('POST', `/api/cases/${id}/transition`, { status });
  assert.equal(result.statusCode, expected, result.body);
  return result;
}
async function releaseToQuality(f: Awaited<ReturnType<typeof fixture>>, item: CaseRecord) {
  await transition(f, item.id, 'assessment');
  await transition(f, item.id, 'approval');
  assert.equal(
    (await f.call('PATCH', `/api/cases/${item.id}`, { designApproved: true })).statusCode,
    200,
  );
  const q = await quote(f, item.id);
  assert.equal(
    (await f.call('POST', `/api/quotes/${q.id}/approve`, { confirmed: true })).statusCode,
    200,
  );
  await transition(f, item.id, 'production');
  await transition(f, item.id, 'quality');
}

test('first account setup, private APIs, hashed credentials and durable login sessions', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.app.inject('/api/dashboard')).statusCode, 401);
    assert.equal(
      (await f.app.inject({ method: 'POST', url: '/api/auth/setup', payload: credentials }))
        .statusCode,
      409,
    );
    const me = (await f.call('GET', '/api/auth/me')).json();
    assert.equal(me.user.email, credentials.email);
    assert.equal(me.needsSetup, false);
    assert.equal(me.user.password_hash, undefined);
    const db = new DatabaseSync(f.databasePath);
    const stored = db.prepare('SELECT password_hash FROM users').get() as { password_hash: string };
    assert.notEqual(stored.password_hash, credentials.password);
    assert.match(stored.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
    const token = db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
    assert.ok(!f.headers.cookie.includes(token.token_hash));
    db.close();
    const wrong = await f.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: credentials.email, password: 'wrong-password' },
    });
    assert.equal(wrong.statusCode, 401);
    assert.match(wrong.json().error, /incorrect/);
    const login = await f.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173' },
      payload: { email: credentials.email.toUpperCase(), password: credentials.password },
    });
    assert.equal(login.statusCode, 200);
    assert.match(login.headers['set-cookie'] as string, /HttpOnly/);
    assert.match(login.headers['set-cookie'] as string, /SameSite=Strict/);
    await f.call('POST', '/api/auth/logout', {});
    assert.equal((await f.call('GET', '/api/dashboard')).statusCode, 401);
  } finally {
    await f.close();
  }
});

test('rejects cross-origin writes, invalid quantities, unknown fields and missing dimensions', async () => {
  const f = await fixture();
  try {
    const crossSite = await f.app.inject({
      method: 'POST',
      url: '/api/cases',
      headers: { ...f.headers, origin: 'https://malicious.example' },
      payload: { title: 'Bad request', customer: 'Test' },
    });
    assert.equal(crossSite.statusCode, 403);
    const crossFetch = await f.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { ...f.headers, 'sec-fetch-site': 'cross-site' },
      payload: { workspaceName: 'Changed' },
    });
    assert.equal(crossFetch.statusCode, 403);
    assert.equal(
      (await f.call('POST', '/api/cases', { title: 'Test', customer: 'Lab', quantity: -1 }))
        .statusCode,
      400,
    );
    assert.equal(
      (await f.call('POST', '/api/cases', { title: 'Test', customer: 'Lab', quoteApproved: true }))
        .statusCode,
      400,
    );
    const item = await newCase(f, { dimensions: '' });
    assert.equal(
      (await f.call('PATCH', `/api/cases/${item.id}`, { designApproved: true })).statusCode,
      409,
    );
    for (const dimensions of ['sample needed', '80 mm inferred from a photo', '80 mm unverified', '80 mm not yet measured', 'placeholder', 'measurements required']) {
      assert.equal((await f.call('PATCH', `/api/cases/${item.id}`, { dimensions })).statusCode, 200);
      assert.equal((await f.call('PATCH', `/api/cases/${item.id}`, { designApproved: true })).statusCode, 409, dimensions);
    }
    await f.call('PATCH', `/api/cases/${item.id}`, { dimensions: '80 x 45 x 12 mm, interface measured', material: 'To be assessed' });
    const unassessedMaterial = await f.call('PATCH', `/api/cases/${item.id}`, { designApproved: true });
    assert.equal(unassessedMaterial.statusCode, 409);
    assert.match(unassessedMaterial.json().error, /material/);
    await f.call('PATCH', `/api/cases/${item.id}`, { material: 'PETG', route: 'assess' });
    const unassessedRoute = await f.call('PATCH', `/api/cases/${item.id}`, { designApproved: true });
    assert.equal(unassessedRoute.statusCode, 409);
    assert.match(unassessedRoute.json().error, /route/);
    await f.call('PATCH', `/api/cases/${item.id}`, { route: 'make' });
    assert.equal((await f.call('PATCH', `/api/cases/${item.id}`, { designApproved: true })).statusCode, 200);
    assert.equal(
      (await f.call('PATCH', `/api/cases/${item.id}`, { quoteApproved: true })).statusCode,
      400,
    );
    assert.equal((await f.call('GET', '/api/cases/not-an-id')).statusCode, 400);
    assert.equal((await f.call('GET', '/api/cases/99999')).statusCode, 404);
  } finally {
    await f.close();
  }
});

test('workflow requires current design, exact latest quote and all measured QC checks', async () => {
  const f = await fixture();
  try {
    const item = await newCase(f);
    await transition(f, item.id, 'production', 409);
    await transition(f, item.id, 'assessment');
    await transition(f, item.id, 'approval');
    await transition(f, item.id, 'production', 409);
    await f.call('PATCH', `/api/cases/${item.id}`, { designApproved: true });
    await transition(f, item.id, 'production', 409);
    const first = await quote(f, item.id);
    assert.equal(first.total, 5428);
    assert.equal(
      (await f.call('POST', `/api/quotes/${first.id}/approve`, { confirmed: false })).statusCode,
      400,
    );
    await f.call('POST', `/api/quotes/${first.id}/approve`, { confirmed: true });
    const latest = await quote(f, item.id);
    assert.equal(
      (await f.call('POST', `/api/quotes/${first.id}/approve`, { confirmed: true })).statusCode,
      409,
    );
    await transition(f, item.id, 'production', 409);
    await f.call('POST', `/api/quotes/${latest.id}/send`, {});
    await f.call('POST', `/api/quotes/${latest.id}/approve`, { confirmed: true });
    await transition(f, item.id, 'production');
    await transition(f, item.id, 'quality');
    await transition(f, item.id, 'ready', 409);
    const checks = (await f.call('GET', '/api/dashboard'))
      .json<DashboardData>()
      .qualityChecks.filter((q) => q.caseId === item.id);
    assert.ok(checks.length >= 3);
    assert.equal(
      (await f.call('PATCH', `/api/quality/${checks[0].id}`, { actual: '', passed: true }))
        .statusCode,
      400,
    );
    for (const check of checks)
      assert.equal(
        (
          await f.call('PATCH', `/api/quality/${check.id}`, {
            actual: 'Measured result within drawing tolerance; fit accepted.',
            passed: true,
          })
        ).statusCode,
        200,
      );
    await f.call('PATCH', `/api/quality/${checks[0].id}`, {
      actual: '80.7 mm exceeds drawing upper limit 80.2 mm.',
      passed: false,
    });
    await transition(f, item.id, 'ready', 409);
    await f.call('PATCH', `/api/quality/${checks[0].id}`, {
      actual: 'Reworked to 80.1 mm; within 80.0 ± 0.2 mm tolerance.',
      passed: true,
    });
    await transition(f, item.id, 'ready');
    await transition(f, item.id, 'delivered');
    await transition(f, item.id, 'assessment', 409);
    assert.equal(
      (await f.call('PATCH', `/api/cases/${item.id}`, { dimensions: '90 mm' })).statusCode,
      409,
    );
    const board = (await f.call('GET', '/api/dashboard')).json<DashboardData>();
    assert.equal(board.parts.filter((p) => p.caseId === item.id).length, 1);
  } finally {
    await f.close();
  }
});

test('a changed specification creates a new revision and invalidates approvals and QC', async () => {
  const f = await fixture();
  try {
    const item = await newCase(f);
    await releaseToQuality(f, item);
    const check = (await f.call('GET', '/api/dashboard')).json<DashboardData>().qualityChecks[0];
    await f.call('PATCH', `/api/quality/${check.id}`, { actual: '80.0 mm', passed: true });
    const oldQuote = (await f.call('GET', '/api/dashboard')).json<DashboardData>().quotes[0];
    const response = await f.call('PATCH', `/api/cases/${item.id}`, {
      dimensions: '85 x 45 x 12 mm',
    });
    assert.equal(response.statusCode, 200, response.body);
    const updated = response.json<CaseRecord>();
    assert.equal(updated.revision, 2);
    assert.equal(updated.designApproved, false);
    assert.equal(updated.quoteApproved, false);
    assert.equal(updated.status, 'assessment');
    assert.equal(
      (await f.call('POST', `/api/quotes/${oldQuote.id}/approve`, { confirmed: true })).statusCode,
      409,
    );
    assert.equal(
      (await f.call('PATCH', `/api/cases/${item.id}`, { revision: 1, owner: 'Another person' }))
        .statusCode,
      409,
    );
    const all = (await f.call('GET', '/api/dashboard')).json<DashboardData>();
    assert.ok(all.qualityChecks.every((q) => q.passed === null));
    assert.ok(all.activities.some((a) => a.type === 'revision'));
    const history = (await f.call('GET', `/api/cases/${item.id}/revisions`)).json<
      Array<{ revision: number; specification: CaseRecord }>
    >();
    assert.equal(history.length, 2);
    assert.equal(history[0].specification.dimensions, '85 x 45 x 12 mm');
    assert.equal(history[1].specification.dimensions, item.dimensions);
  } finally {
    await f.close();
  }
});

test('records survive server restart and library reorders require confirmation and new approvals', async () => {
  const f = await fixture(true);
  let restarted: FastifyInstance | undefined;
  try {
    const board = (await f.call('GET', '/api/dashboard')).json<DashboardData>();
    assert.equal(board.machines.length, 10);
    assert.equal(board.cases.length, 18);
    assert.equal(board.settings.demoMode, true);
    assert.equal(board.parts.length, 6);
    for (const libraryPart of board.parts) {
      const source = board.cases.find((item) => item.id === libraryPart.caseId)!;
      assert.equal(source.status, 'delivered');
      assert.equal(source.revision, libraryPart.revision);
      assert.equal(source.designApproved, true);
      assert.equal(source.quoteApproved, true);
      assert.equal(libraryPart.lastMade, source.updatedAt.slice(0, 10));
      const requiredChecks = board.qualityChecks.filter(
        (check) => check.caseId === source.id && check.required,
      );
      assert.ok(requiredChecks.length > 0);
      assert.ok(requiredChecks.every((check) => check.passed === true && check.actual.length > 0));
      assert.ok(
        board.quotes.some((quote) => quote.caseId === source.id && quote.status === 'approved'),
      );
    }
    const part = board.parts[0];
    assert.equal(
      (await f.call('POST', `/api/parts/${part.id}/reorder`, { quantity: 3, confirmed: false }))
        .statusCode,
      400,
    );
    const reordered = await f.call('POST', `/api/parts/${part.id}/reorder`, {
      quantity: 3,
      confirmed: true,
    });
    assert.equal(reordered.statusCode, 201);
    const item = reordered.json<CaseRecord>();
    assert.equal(item.quantity, 3);
    assert.equal(item.designApproved, false);
    assert.equal(item.quoteApproved, false);
    assert.equal(
      (
        await f.call('PATCH', '/api/settings', {
          workspaceName: 'Persisted Workshop',
          hourlyRate: 825,
        })
      ).statusCode,
      200,
    );
    assert.equal((await f.call('PATCH', '/api/settings', { demoMode: false })).statusCode, 400);
    await f.app.close();
    restarted = await buildServer({
      databasePath: f.databasePath,
      uploadDir: f.uploadDir,
      demo: true,
      logger: false,
      serveStatic: false,
    });
    const persisted = await restarted.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: f.headers,
    });
    assert.equal(persisted.statusCode, 200);
    assert.equal(persisted.json<DashboardData>().settings.workspaceName, 'Persisted Workshop');
    assert.equal(persisted.json<DashboardData>().cases.length, 19);
    assert.equal(persisted.json<DashboardData>().cases.find((c) => c.id === item.id)!.quantity, 3);
  } finally {
    if (restarted) await restarted.close();
    await f.close();
  }
});

test('uploads are private, versioned and downloaded as attachments; CSV prevents formula injection', async () => {
  const f = await fixture();
  try {
    const item = await newCase(f, { title: '=HYPERLINK("https://example.com")' });
    const boundary = 'ToborTestBoundary';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="drawing.txt"\r\nContent-Type: text/plain\r\n\r\nInterface: 80 x 45 mm\r\n--${boundary}--\r\n`;
    const upload = await f.app.inject({
      method: 'POST',
      url: `/api/cases/${item.id}/files`,
      headers: { ...f.headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    assert.equal(upload.statusCode, 201, upload.body);
    assert.equal(upload.json().revision, 2);
    const fileId = upload.json().id;
    assert.equal((await f.app.inject(`/api/files/${fileId}`)).statusCode, 401);
    const file = await f.call('GET', `/api/files/${fileId}`);
    assert.equal(file.statusCode, 200);
    assert.match(file.headers['content-disposition'] as string, /^attachment;/);
    assert.match(file.body, /Interface/);
    const listing = (await f.call('GET', `/api/cases/${item.id}/files`)).json();
    assert.equal(listing[0].filename, 'drawing.txt');
    assert.equal(listing[0].storage_name, undefined);
    const unsafe = await f.app.inject({
      method: 'POST',
      url: `/api/cases/${item.id}/files`,
      headers: { ...f.headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body.replace('drawing.txt', 'script.html'),
    });
    assert.equal(unsafe.statusCode, 400);
    const csv = await f.call('GET', '/api/export/cases.csv');
    assert.equal(csv.statusCode, 200);
    assert.match(csv.body, /"'=HYPERLINK/);
    assert.equal((await f.call('GET', '/api/not-a-real-route')).statusCode, 404);
  } finally {
    await f.close();
  }
});

test('authenticated event streams deliver mutations and close immediately on logout', async () => {
  const f = await fixture();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const address = await f.app.listen({ host: '127.0.0.1', port: 0 });
    const unauthenticated = await fetch(`${address}/api/events`);
    assert.equal(unauthenticated.status, 401);
    await unauthenticated.text();
    const response = await fetch(`${address}/api/events`, {
      headers: f.headers,
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /text\/event-stream/);
    reader = response.body!.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: connected/);
    await newCase(f);
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: update/);
    await f.call('POST', '/api/auth/logout', {});
    assert.equal((await reader.read()).done, true);
  } finally {
    await reader?.cancel();
    await f.close();
  }
});
