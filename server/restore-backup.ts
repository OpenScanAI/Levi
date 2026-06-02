import postgres from 'postgres';
import fs from 'fs';

async function restore() {
  const sql = postgres({
    host: 'localhost',
    port: 54329,
    username: 'postgres',
    database: 'postgres'
  });

  try {
    console.log('Connecting to PostgreSQL...');
    await sql`SELECT 1`;
    console.log('✓ Connected');

    console.log('Dropping and recreating paperclip database...');
    await sql`DROP DATABASE IF EXISTS paperclip`;
    await sql`CREATE DATABASE paperclip`;
    console.log('✓ Database recreated');

    await sql.end();
    
    const paperclipSql = postgres({
      host: 'localhost',
      port: 54329,
      username: 'postgres',
      database: 'paperclip'
    });

    console.log('Reading backup file...');
    const backupSql = fs.readFileSync('/Users/digitone/.paperclip/instances/default/restore.sql', 'utf-8');
    console.log(`✓ Backup file loaded (${(backupSql.length / 1024 / 1024).toFixed(2)} MB)`);

    console.log('Restoring data (this may take a minute)...');
    await paperclipSql.unsafe(backupSql);
    console.log('✓ Backup restored successfully!');
    console.log('✓ Your OpenScanAI company and all data have been recovered!');

    await paperclipSql.end();
    process.exit(0);
  } catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(1);
  }
}

restore();
