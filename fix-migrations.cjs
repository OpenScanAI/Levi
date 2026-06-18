const { spawn } = require('child_process');
const fs = require('fs');
const postgres = require('postgres');

const pgPath = '/home/daksh/projects/paperclip/node_modules/.pnpm/@embedded-postgres+linux-x64@18.1.0-beta.16/node_modules/@embedded-postgres/linux-x64/native/bin/postgres';
const dataDir = '/home/daksh/.paperclip/instances/default/db';
const port = 54329;

async function main() {
  console.log('Starting embedded PostgreSQL...');
  const pg = spawn(pgPath, ['-D', dataDir, '-p', String(port)], {
    detached: true,
    stdio: 'ignore'
  });

  await new Promise(r => setTimeout(r, 3000));
  console.log('PG started, PID:', pg.pid);

  const hbaPath = dataDir + '/pg_hba.conf';
  const originalHba = fs.readFileSync(hbaPath, 'utf8');
  fs.writeFileSync(hbaPath, originalHba.replace(/password/g, 'trust'));
  
  const pgCtl = pgPath.replace('/postgres', '/pg_ctl');
  require('child_process').execSync(pgCtl + ' reload -D ' + dataDir);
  await new Promise(r => setTimeout(r, 1000));

  const client = postgres({
    host: '127.0.0.1',
    port: port,
    database: 'paperclip',
    user: 'paperclip'
  });

  try {
    await client`DELETE FROM drizzle."__drizzle_migrations"`;
    console.log('Cleared existing migration entries');

    const migrationsDir = '/home/daksh/projects/paperclip/packages/db/src/migrations';
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && !f.startsWith('meta'))
      .sort();

    console.log('Found migrations:', files.length);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const hash = file.replace('.sql', '');
      const createdAt = 1771300567463 + (i * 1000000);

      await client.unsafe(
        `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ('${hash}', ${createdAt})`
      );
    }

    const result = await client`SELECT COUNT(*) as count FROM drizzle."__drizzle_migrations"`;
    console.log('Migration journal entries:', result[0].count);

    const latest = await client`SELECT hash FROM drizzle."__drizzle_migrations" ORDER BY id DESC LIMIT 5`;
    console.log('Latest 5 entries:', latest.map(m => m.hash));

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await client.end();
    fs.writeFileSync(hbaPath, originalHba);
    console.log('Restored pg_hba');
    process.kill(-pg.pid, 'SIGTERM');
    console.log('Stopped PG');
  }
}

main().catch(console.error);
