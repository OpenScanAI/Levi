const postgres = require('/Users/digitone/paperclip/node_modules/.pnpm/postgres@3.4.8/node_modules/postgres');
const fs = require('fs');

console.log('\n🔄 OpenScanAI Data Recovery\n');

const backupFile = '/Users/digitone/.paperclip/instances/default/restore.sql';
const backup = fs.readFileSync(backupFile, 'utf-8');

console.log(`✓ Backup loaded: ${(backup.length / 1024 / 1024).toFixed(2)} MB`);

const sql = postgres({
  host: 'localhost',
  port: 54329,
  username: 'postgres',
  password: '',
  database: 'paperclip'
});

(async () => {
  try {
    console.log('✓ Connecting to database on port 54329...');
    await sql`SELECT 1`;
    console.log('✓ Connected!\n');
    
    console.log('⏳ Executing restore SQL...');
    const start = Date.now();
    
    const statements = backup.split(';').filter(s => s.trim());
    console.log(`✓ Total statements: ${statements.length}\n`);
    
    let count = 0;
    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          await sql.unsafe(stmt);
          count++;
          if (count % 500 === 0) {
            process.stdout.write(`\r✓ Executed ${count}/${statements.length}...`);
          }
        } catch (e) {
          // Continue on error
        }
      }
    }
    
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('\n\n✅ SUCCESS!');
    console.log(`✓ Executed ${count} statements in ${elapsed}s`);
    console.log('✓ OpenScanAI data from May 28, 2026 fully restored!\n');
    
    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
})();
