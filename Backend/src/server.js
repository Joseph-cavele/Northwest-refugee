import app from './app.js';
import env from './config/env.js';
import logger from './config/logger.js';
import { connectDB, disconnectDB } from './config/db.js';
import { startJobs, stopJobs } from './jobs/index.js';

// Boot order matters: the database must be up before the port opens, or the platform
// health check goes green while every request 500s.

// How long in-flight requests get to finish before the process is killed anyway. Render
// and most orchestrators send SIGTERM then SIGKILL after ~30s, so stay under that.
const SHUTDOWN_TIMEOUT_MS = 15_000;

let server;
let shuttingDown = false;

async function shutdown(signal, exitCode = 0) {
  // A second Ctrl-C while the first shutdown is draining must not run all of this twice
  // — closing an already-closing server throws, which would mask the original reason.
  if (shuttingDown) {
    logger.warn({ signal }, 'shutdown already in progress');
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  // Kill the process if draining stalls — a hung socket must not keep a dead instance
  // holding the port. unref() so this timer alone never keeps the loop alive.
  const forceExit = setTimeout(() => {
    logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    // Cron first: a job that starts mid-shutdown would write against a closing connection.
    stopJobs();

    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      logger.info('HTTP server closed');
    }

    // Last, so in-flight requests still have a database to finish against.
    await disconnectDB();
  } catch (err) {
    logger.error({ err }, 'error during shutdown');
    exitCode = 1;
  } finally {
    clearTimeout(forceExit);
    process.exit(exitCode);
  }
}

async function start() {
  try {
    await connectDB();

    server = app.listen(env.PORT, () => {
      logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server listening');
    });

    // EADDRINUSE arrives here, not as a throw from listen().
    server.on('error', (err) => {
      logger.fatal({ err }, 'HTTP server error');
      shutdown('server-error', 1);
    });

    startJobs();
  } catch (err) {
    // Nothing is listening yet, so exit directly rather than draining.
    logger.fatal({ err }, 'failed to start');
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal));
}

// An unhandled rejection leaves the process in an unknown state. Drain and let the
// orchestrator restart us rather than serving from a corrupted one.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled rejection');
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  shutdown('uncaughtException', 1);
});

start();
