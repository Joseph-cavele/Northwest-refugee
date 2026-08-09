import mongoose from 'mongoose';
import env from './env.js';
import logger from './logger.js';

// Atlas must stay pinned to af-south-1 (Cape Town) for data residency — that is a cluster
// setting, not a code one, but it is the reason this file never falls back to another host.

export async function connectDB() {
  mongoose.set('strictQuery', true);

  // Surface a bad URI or an IP-allowlist miss in seconds rather than after the driver's
  // 30s default, so `npm run dev` fails while you are still looking at the terminal.
  const conn = await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 10_000,
  });

  // Log the host, never the URI: it carries the password.
  logger.info({ host: conn.connection.host, db: conn.connection.name }, 'MongoDB connected');

  // A dropped connection after boot is not fatal — the driver reconnects — but it must
  // be visible, because every request in the gap fails.
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));

  return conn;
}

export async function disconnectDB() {
  await mongoose.connection.close(false);
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
