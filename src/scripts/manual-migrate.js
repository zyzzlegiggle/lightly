const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function run() {
  if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL not found in .env");
      process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    // Manually add the missing columns for Linear and Changes persistence
    const sql = `
      ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "pendingChanges" jsonb;
      ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "linearProjectId" text;
      ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "linearTeamId" text;
    `;

    console.log("Executing migration...");
    await client.query(sql);
    console.log("Successfully updated database schema!");
  } catch (err) {
    console.error("Manual migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
