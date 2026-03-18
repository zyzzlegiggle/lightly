import { db } from "./src/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  try {
    await db.execute(sql`ALTER TABLE "user" ADD COLUMN "username" text UNIQUE;`);
    console.log("Added username column.");
  } catch (e) {
    console.error(e);
  }
}
main();
