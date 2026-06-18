import { spawn } from 'child_process';
import postgres from 'postgres';
import * as fs from 'fs';

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

  const client = postgres('postgresql://postgres@localhost:54329/postgres', { max: 1 });

  try {
    await client`CREATE SCHEMA IF NOT EXISTS drizzle`;

    await client`
      CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `;

    const migrationsDir = '/home/daksh/projects/paperclip/packages/db/src/migrations';
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && !f.startsWith('meta'))
      .sort();

    console.log('Found migrations:', files.length);

    for (const file of files) {
      const hash = file.replace('.sql', '');
      const idx = parseInt(hash.split('_')[0]);
      const createdAt = 1771300567463 + (idx * 1000000);

      await client`
        INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)
        VALUES (${hash}, ${createdAt})
        ON CONFLICT DO NOTHING
      `;
    }

    const result = await client`SELECT COUNT(*) as count FROM drizzle."__drizzle_migrations"`;
    console.log('Migration journal entries:', result[0].count);

    const tables = await client`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    console.log('Public tables count:', tables.length);
    console.log('First 20 tables:', tables.slice(0, 20).map((t: any) => t.tablename).join(', '));

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await client.end();
    process.kill(-pg.pid, 'SIGTERM');
    console.log('Stopped PG');
  }
}

main().catch(console.error);
