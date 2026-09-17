import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * The database connection.
 *
 * Two things here exist because of where this runs in production. A serverless
 * platform gives each concurrent request its own instance, and each instance
 * evaluates this module and opens its own pool — so the setting that matters
 * is not how many connections one pool may hold but how many pools there will
 * be. `max: 1` keeps each instance to a single connection and lets Supabase's
 * pooler do the multiplexing it is there for; the default of ten would let a
 * modest traffic spike exhaust the project's connection limit.
 *
 * TLS is on for anything that is not local. Without an `ssl` option
 * node-postgres sends no SSLRequest at all and the session runs in plaintext —
 * Supabase's pooler accepts that quite happily, so nothing complains and every
 * student's answers cross the network in the clear. Verification is disabled
 * because the pooler presents a self-signed chain; that is encryption without
 * proof of identity, which is worth far more than nothing and less than
 * pinning Supabase's CA certificate, the upgrade to make if this ever holds
 * anything that matters.
 */
const url = process.env.DATABASE_URL ?? "";
const isLocal = url.includes("127.0.0.1") || url.includes("localhost");

const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: url,
    max: isLocal ? 10 : 1,
    idleTimeoutMillis: 10_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

// Cached in every environment: in development it survives hot reloads, and in
// production it stops a re-evaluated module leaving the previous pool orphaned.
globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
