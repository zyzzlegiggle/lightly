/**
 * Migration: add workspaceNote and workspaceEvent tables
 * Run with: npx tsx scripts/add-workspace-tables.ts
 */
import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";
import "dotenv/config";

async function migrate() {
  console.log("Running workspace tables migration...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "workspaceNote" (
      "id"        text PRIMARY KEY,
      "userId"    text NOT NULL REFERENCES "user"("id"),
      "title"     text NOT NULL DEFAULT 'Untitled',
      "content"   text NOT NULL DEFAULT '',
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ workspaceNote table ready");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "workspaceEvent" (
      "id"          text PRIMARY KEY,
      "userId"      text NOT NULL REFERENCES "user"("id"),
      "title"       text NOT NULL,
      "description" text,
      "startAt"     timestamp NOT NULL,
      "endAt"       timestamp,
      "allDay"      boolean NOT NULL DEFAULT false,
      "color"       text DEFAULT 'zinc',
      "createdAt"   timestamp NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ workspaceEvent table ready");

  console.log("\nMigration complete!");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
