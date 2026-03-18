import { db } from "../src/lib/db";
import fs from "fs";
import path from "path";
import "dotenv/config";

async function initialize() {
  try {
    console.log("Reading migration SQL...");
    const sqlPath = path.join(process.cwd(), "drizzle", "0000_talented_rachel_grey.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");

    // Split by statement-breakpoint and filter empty lines
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`Executing ${statements.length} SQL statements...`);

    for (const statement of statements) {
      console.log(`Running: ${statement.substring(0, 50)}...`);
      await db.execute(statement);
    }

    console.log("✅ Database initialized successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Initialization failed:");
    console.error(err);
    process.exit(1);
  }
}

initialize();
