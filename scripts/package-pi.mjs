import { build } from 'esbuild';
import { backup, DatabaseSync } from 'node:sqlite';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const releaseId = new Date().toISOString().replaceAll(/[-:.]/g, '');
const root = resolve('.tools/pi-releases', releaseId);
const app = resolve(root, 'app');
await mkdir(app, { recursive: true });
await build({
  entryPoints: ['server/index.ts'],
  outfile: resolve(app, 'server.mjs'),
  bundle: true,
  packages: 'external',
  platform: 'node',
  target: 'node24',
  format: 'esm',
});
await cp('dist', resolve(app, 'dist'), { recursive: true });
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const names = [
  'fastify',
  '@fastify/cookie',
  '@fastify/multipart',
  '@fastify/rate-limit',
  '@fastify/static',
  'zod',
];
const dependencies = Object.fromEntries(
  names.map((name) => [name, lock.packages[`node_modules/${name}`].version]),
);
await writeFile(
  resolve(app, 'package.json'),
  JSON.stringify(
    {
      name: 'tobor-pi-runtime',
      version: '1.0.0',
      private: true,
      type: 'module',
      engines: { node: '>=24' },
      scripts: { start: 'node server.mjs' },
      dependencies,
    },
    null,
    2,
  ) + '\n',
);
await cp('deploy', resolve(root, 'deploy'), { recursive: true });
const state = resolve(root, 'state');
await mkdir(state);
if (existsSync('data/tobor.sqlite')) {
  const source = new DatabaseSync('data/tobor.sqlite', { readOnly: true });
  try {
    await backup(source, resolve(state, 'tobor.sqlite'));
  } finally {
    source.close();
  }
  const snapshot = new DatabaseSync(resolve(state, 'tobor.sqlite'));
  try {
    // A new host needs fresh browser sessions; preserve accounts and business records.
    snapshot.exec('DELETE FROM sessions');
    const integrity = snapshot.prepare('PRAGMA integrity_check').get();
    if (integrity.integrity_check !== 'ok')
      throw new Error('Database backup failed integrity check.');
  } finally {
    snapshot.close();
  }
}
if (existsSync('data/uploads'))
  await cp('data/uploads', resolve(state, 'uploads'), { recursive: true });
await writeFile(
  resolve('.tools', 'pi-release.json'),
  JSON.stringify({ releaseId, root, app }, null, 2),
);
console.log(
  JSON.stringify({
    releaseId,
    root,
    app,
    databaseIncluded: existsSync(resolve(state, 'tobor.sqlite')),
  }),
);
