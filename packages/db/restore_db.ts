
import fs from 'fs';
import postgres from 'postgres';

const sql = fs.readFileSync('/tmp/restore_backup.sql', 'utf8');

const client = postgres({
  host: '127.0.0.1',
  port: 54329,
  username: 'postgres',
  password: 'postgres',
  database: 'postgres',
  onnotice: () => {},
});

async function restore() {
  try {
    await client.unsafe(sql);
    console.log('Restore completed successfully');
  } catch (err) {
    console.error('Restore error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

restore();
