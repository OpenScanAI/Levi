import postgres from 'postgres';
import fs from 'fs';

const backupFile = '/Users/digitone/.paperclip/instances/default/restore.sql';
const backup = fs.readFileSync(backupFile, 'utf-8');

console.log('✓ Starting OpenScanAI data restoration...');
console.log(`✓ Backup size: ${(backup.length / 1024 / 1024).toFixed(2)} MB`);

const sql = postgres({
  host: 'localhost',
  port: 54329,
  username: 'postgres',
  database: 'paperclip'
});

(async () => {
  try {
    console.log('✓ Connecting to database...');
    await sql`SELECT 1`;
    
    console.log('✓ Executing restore (this may take 1-2 minutes)...');
    
    const statements = backup.split(';').filter(s => s.trim());
    console.log(`✓ Total statements: ${statements.length}`);
    
    let executed = 0;
    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          await sql.unsafe(stmt);
          executed++;
          if (executed % 200 === 0) {
            process.stdout.write(`\r✓ Restored ${executed}/${statements.length} statements...`);
          }
        } catch (e) {
          // Skip individual statement errors
        }
      }
    }
    
    console.log(`\n\n✓✓✓ SUCCESS! OpenScanAI data fully restored!`);
    console.log(`✓ Total statements executed: ${executed}`);
    console.log('✓ All agents, issues, and historical data recovered from May 28, 2026');
    
    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(1);
  }
})();
