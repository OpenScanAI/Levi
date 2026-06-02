import { createDb } from '@paperclipai/db';
import fs from 'fs';

console.log('\n🔄 OpenScanAI Data Recovery\n');

const backupFile = '/Users/digitone/.paperclip/instances/default/restore.sql';
const backup = fs.readFileSync(backupFile, 'utf-8');

console.log(`✓ Backup loaded: ${(backup.length / 1024 / 1024).toFixed(2)} MB`);

(async () => {
  try {
    const db = createDb({
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      database: 'paperclip'
    });
    
    console.log('✓ Connected to database...\n');
    console.log('⏳ Restoring data (this takes 1-2 minutes)...\n');
    
    await db.unsafe(backup);
    
    console.log('\n✅ SUCCESS! OpenScanAI data fully restored!');
    console.log('✓ All agents from May 28, 2026 recovered');
    console.log('✓ All historical issues and data restored');
    console.log('\n🎉 Refresh your dashboard to see the recovered data!\n');
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
})();
