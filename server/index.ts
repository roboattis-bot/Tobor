import { buildServer } from './app';

const server = await buildServer();
await server.listen({
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3001),
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
