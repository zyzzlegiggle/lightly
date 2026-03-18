const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to DigitalOcean PostgreSQL...");
    
    // Deletes all rows from the project table
    const result = await client.query(`DELETE FROM "project"`);
    
    console.log(`✅ Successfully cleaned ${result.rowCount} old projects from the database!`);
  } catch(e) {
    console.error("Connection error:", e.message);
  } finally {
    await client.end();
  }
}
run();
