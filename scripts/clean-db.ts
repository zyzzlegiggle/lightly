/**
 * Cleans all data from the database tables.
 * Deletes in FK-safe order: project → account → session → verification → user
 */

import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function cleanDb() {
  const client = await pool.connect();
  try {
    console.log("🗑️  Cleaning database...\n");

    // Delete in FK-safe order (children first, then parents)
    const tables = ["project", "account", "session", "verification", "user"];

    for (const table of tables) {
      const result = await client.query(`DELETE FROM "${table}"`);
      console.log(`  ✓ ${table}: deleted ${result.rowCount} rows`);
    }

    console.log("\n✅ Database cleaned successfully!");
  } catch (err) {
    console.error("❌ Error cleaning database:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanDb();
