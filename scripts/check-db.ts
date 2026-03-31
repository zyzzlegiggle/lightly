import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function check() {
  const tables = ["user", "project", "account", "session", "verification"];
  for (const t of tables) {
    const r = await pool.query(`SELECT count(*) FROM "${t}"`);
    console.log(`${t}: ${r.rows[0].count} rows`);
  }
  await pool.end();
}

check();
