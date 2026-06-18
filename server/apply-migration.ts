import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres/cjs/src/index.js';

const client = postgres({ host: '127.0.0.1', port: 54329, database: 'paperclip', user: 'paperclip', password: 'paperclip' });
const db = drizzle(client);

const sql = `ALTER TABLE "research_sessions" 
  ADD COLUMN IF NOT EXISTS "original_report" text,
  ADD COLUMN IF NOT EXISTS "is_edited" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "started_at" timestamp,
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now()`;

db.execute(sql).then(r => {
  console.log('Migration applied:', JSON.stringify(r, null, 2));
  client.end();
}).catch(e => {
  console.error('Error:', e);
  client.end();
});
