import mongoose from 'mongoose';
import env from './env.js';
import logger from './logger.js';

// Atlas must stay pinned to af-south-1 (Cape Town) for data residency — that is a cluster
// setting, not a code one, but it is the reason this file never falls back to another host.

/*
 * WHY THIS FILE CHANGED IN THE NEXT PORT
 *
 * Under Express, server.js awaited connectDB() once before the port opened, and every
 * request afterwards shared that one connection. A Route Handler has no such boot step: it
 * is invoked cold, possibly in a fresh isolate, and there is no "before the server starts".
 *
 * Connecting per request is not an option. Each mongoose.connect() opens its own pool, and
 * on a serverless runtime under load that is hundreds of pools against a cluster whose
 * connection ceiling is a few hundred — Atlas starts refusing connections and the symptom
 * is intermittent 500s that never reproduce locally.
 *
 * So the promise is cached on globalThis, not in a module variable. Next's dev server
 * re-evaluates modules on every hot reload, which would leak a new pool per save; the
 * global survives that, and in production it is simply the warm-instance cache.
 */

const GLOBAL_KEY = Symbol.for('nwhr.mongoose');

/** @type {{ conn: typeof mongoose | null, promise: Promise<typeof mongoose> | null }} */
const cache = (globalThis[GLOBAL_KEY] ??= { conn: null, promise: null });

export async function connectDB() {
  if (cache.conn) return cache.conn;

  // The PROMISE is cached, not just the result. Two handlers invoked in the same tick on a
  // cold instance would both see `conn: null` and both dial out; awaiting one shared
  // in-flight promise is what makes that a single connection.
  cache.promise ??= (async () => {
    mongoose.set('strictQuery', true);

    // Surface a bad URI or an IP-allowlist miss in seconds rather than after the driver's
    // 30s default. On a serverless platform this matters more than it did under Express:
    // the function has its own timeout, and a 30s selection wait spends the whole budget
    // before anything is logged.
    const conn = await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 10_000,
      // Small per-instance pool. A long-lived Express process wanted a large one; here
      // there may be many instances, and the ceiling that matters is the cluster's total.
      maxPoolSize: 10,
    });

    // Log the host, never the URI: it carries the password.
    logger.info(
      { host: conn.connection.host, db: conn.connection.name },
      'MongoDB connected'
    );

    // A dropped connection after boot is not fatal — the driver reconnects — but it must
    // be visible, because every request in the gap fails.
    conn.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
    conn.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
    conn.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));

    return conn;
  })();

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    // Clear the failed promise or every later request awaits the same rejection forever —
    // a transient DNS blip at cold start would take the instance down until it recycled.
    cache.promise = null;
    throw err;
  }

  return cache.conn;
}

export async function disconnectDB() {
  if (!cache.conn) return;
  await mongoose.connection.close(false);
  cache.conn = null;
  cache.promise = null;
  logger.info('MongoDB connection closed');
}

/**
 * A standalone mongod refusing a session, by any of the names it uses for it.
 *
 * There is more than one message because the driver fails at different points depending on
 * the server version and whether retryWrites is on: some deployments reject the
 * transaction number, others reject the retryable write that opening a session implies.
 * Matching only the first left the fallback below unreachable on a local mongod, which
 * turned every multi-document write into a 500 instead of the documented degraded path.
 */
const STANDALONE_MESSAGES =
  /Transaction numbers are only allowed on a replica set member or mongos|does not support retryable writes|Transactions are not supported|replica set member or mongos/i;

function isStandaloneRejection(err) {
  // 20 is IllegalOperation, which is what most of these arrive as.
  return err?.code === 20 || STANDALONE_MESSAGES.test(err?.message ?? '');
}

/**
 * Run `fn(session)` inside a transaction so a multi-document write cannot half-commit —
 * a donation settled without its ledger entry is a reconciliation problem nobody finds
 * until audit.
 *
 * Falls back to running without a session on a standalone mongod (local dev), where
 * transactions are unsupported. That fallback loses atomicity, so it is logged: seeing
 * this warning in production means the cluster is not the replica set it should be.
 */
export async function withTransaction(fn) {
  // Ensures the connection on the way in. Under Express the connection was guaranteed by
  // boot order; here a service may be the first thing a cold instance touches.
  await connectDB();

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (!isStandaloneRejection(err)) throw err;
    logger.warn('transactions unavailable (standalone mongod) — running without atomicity');
    return fn(null);
  } finally {
    await session.endSession();
  }
}

export default connectDB;
