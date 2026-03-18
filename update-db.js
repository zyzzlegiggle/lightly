const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected.");
    
    await client.query(`ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "doAppId" text;`);
    await client.query(`ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "activeBranch" text DEFAULT 'main';`);
    await client.query(`ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "lastPreviewUrl" text;`);
    await client.query(`ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "appSpecRaw" jsonb;`);
    
    console.log("Columns added successfully.");
  } catch(e) {
    console.error("Connection error:", e.message);
  } finally {
    await client.end();
  }
}
run();
