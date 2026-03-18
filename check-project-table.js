const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const output = {};
  try {
    await client.connect();
    
    try {
      const res = await client.query(`
        INSERT INTO "project" 
        ("id", "repoId", "githubUrl", "gradientKbId", "userId") 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING *
      `, [
        require('crypto').randomUUID(), 
        "1137688871", 
        "https://github.com/zyzzlegiggle/tenunku.git", 
        "kb-mock-1773839578485", 
        "r3s71XkwxLha8ygaDipoYxqhXpmxr63y"
      ]);
      output.insertResult = res.rows[0];
    } catch (e) {
      output.insertError = e.message;
    }
    
    try {
      const cols = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'project';
      `);
      output.columns = cols.rows;
    } catch (e) {
      output.columnsError = e.message;
    }

  } catch(e) {
    output.connectionError = e.message;
  } finally {
    await client.end();
  }
  fs.writeFileSync('output.json', JSON.stringify(output, null, 2));
}
run();
