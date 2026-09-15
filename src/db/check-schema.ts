/**
 * Prints the tables and row counts of whatever DATABASE_URL points at.
 * Used to confirm a migration landed on the intended target.
 */
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const host = new URL(url).host;
  console.log(`target: ${host}\n`);

  const pool = new Pool({ connectionString: url });
  const { rows } = await pool.query<{ table_name: string; n: string }>(`
    select c.relname as table_name, coalesce(s.n_live_tup, 0)::text as n
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where ns.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `);

  for (const r of rows) {
    console.log(`  ${r.table_name.padEnd(16)} ${r.n.padStart(6)} rows`);
  }
  console.log(`\n${rows.length} tables`);

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
