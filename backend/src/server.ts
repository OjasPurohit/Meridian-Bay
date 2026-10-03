/**
 * Boot: load + validate config -> verify the database is reachable -> create the app -> listen.
 * SIGINT / SIGTERM: stop accepting connections, drain, close the pg pool.
 */
import { ConfigError, getConfig } from './config';
import { createApp, discoverModules } from './app';
import { checkConnection, closePool } from './kernel/db';
import { log } from './kernel/http';

async function main(): Promise<void> {
  let config;
  try {
    config = getConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message); // names variables only, never values
      process.exit(1);
    }
    throw err;
  }

  if (!(await checkConnection())) {
    console.error('Cannot reach the database (DATABASE_URL). Is PostgreSQL running and is the .env value correct?');
    await closePool();
    process.exit(1);
  }

  const modules = await discoverModules();
  const app = await createApp({ config, modules });
  const server = app.listen(config.port, () => {
    log('info', 'server listening', { port: config.port, env: config.node_env, modules: modules.map((m) => m.name) });
  });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log('info', 'shutting down', { signal });
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal start-up error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
