// Quick script to clean all projects from the database
// Run: npx tsx scripts/clean-projects.ts
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const db = drizzle(pool);

async function main() {
  const result = await db.execute(sql`DELETE FROM project`);
  console.log("✅ All projects deleted");
  
  // Show remaining count
  const count = await db.execute(sql`SELECT COUNT(*) as cnt FROM project`);
  console.log(`Projects remaining: ${(count.rows[0] as any).cnt}`);
  
  await pool.end();
}

main().catch(console.error);
