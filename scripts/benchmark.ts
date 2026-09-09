import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { cpus, platform, release } from 'node:os';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { buildServer } from '../server/app';
import type { DashboardData } from '../shared/types';

// Always use a newly-created disposable database; never resolve DATABASE_PATH.
const benchmarkRoot = resolve('.tools/benchmark-runs');
mkdirSync(benchmarkRoot, { recursive: true });
const directory = mkdtempSync(resolve(benchmarkRoot, 'run-'));
const app = await buildServer({
  databasePath: resolve(directory, 'benchmark.sqlite'),
  uploadDir: resolve(directory, 'uploads'),
  demo: true,
  logger: false,
  serveStatic: false,
});
try {
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const setup = await fetch(`${address}/api/auth/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Disposable benchmark operator',
      email: 'benchmark@example.com',
      password: randomBytes(24).toString('hex'),
    }),
  });
  assert.equal(setup.status, 201, await setup.text());
  const session = setup.headers
    .getSetCookie()
    .find((value) => value.startsWith('tobor_session='))
    ?.split(';')[0];
  assert.ok(session, 'The benchmark must receive an authenticated session.');
  const headers = { cookie: session };
  let responseBytes = 0;
  let records: DashboardData | undefined;
  async function dashboard(): Promise<number> {
    const started = performance.now();
    const response = await fetch(`${address}/api/dashboard`, { headers });
    const body = await response.arrayBuffer();
    const elapsed = performance.now() - started;
    assert.equal(response.status, 200);
    responseBytes = body.byteLength;
    records = JSON.parse(new TextDecoder().decode(body)) as DashboardData;
    return elapsed;
  }
  for (let i = 0; i < 10; i++) await dashboard();
  const samples: number[] = [];
  for (let i = 0; i < 60; i++) samples.push(await dashboard());
  samples.sort((a, b) => a - b);
  const percentile = (p: number) => Number(samples[Math.ceil(samples.length * p) - 1].toFixed(3));
  process.stdout.write(
    `${JSON.stringify(
      {
        benchmark:
          'Authenticated GET /api/dashboard over local HTTP, including full response download',
        measuredAt: new Date().toISOString(),
        node: process.version,
        platform: `${platform()} ${release()}`,
        cpu: cpus()[0]?.model,
        transport: '127.0.0.1 loopback HTTP with connection reuse; no TLS or remote network',
        database: 'Disposable seeded SQLite database in WAL mode on the local workspace drive',
        warmupRequests: 10,
        measuredRequests: samples.length,
        concurrency: 1,
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        minMs: samples[0],
        maxMs: samples.at(-1),
        responseBytes,
        cases: records!.cases.length,
        printers: records!.machines.length,
        parts: records!.parts.length,
        limitations:
          'Small warm dataset, sequential requests, API logger disabled. Excludes login hashing, browser rendering and WAN latency. This is not a production load test or performance guarantee.',
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await app.close();
  const target = resolve(directory);
  assert.ok(
    target.startsWith(`${benchmarkRoot}${sep}`),
    'Cleanup target must stay inside the benchmark directory.',
  );
  rmSync(target, { recursive: true, force: true });
}
