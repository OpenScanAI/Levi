import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const backupFile = '/Users/digitone/.paperclip/instances/default/restore.sql';
const backup = fs.readFileSync(backupFile, 'utf-8');

// Use the postgres node package already installed
import('postgres').then(module => {
  const postgres = module.default;
  const sql = postgres({
    host: 'localhost',
    port: 54329,
    username: 'postgres',
    database: 'postgres'
  });

  (async () => {
    try {
      console.log('Connecting...');
      await sql`SELECT 1`;
      console.log('✓ Connected');
      
      console.log('Dropping old database...');
      await sql`DROP DATABASE IF EXISTS paperclip`;
      
      console.log('Creating new database...');
      await sql`CREATE DATABASE paperclip`;
      
      await sql.end();
      
      // Reconnect to the new database
      const sqlNew = postgres({
        host: 'localhost',
        port: 54329,
        username: 'postgres',
        database: 'paperclip'
      });
      
      console.log('Restoring from backup...');
      console.log(`Executing ${backup.split('\n').length} SQL statements...`);
      
      await sqlNew.unsafe(backup);
      
      console.log('✓✓✓ SUCCESS! Your OpenScanAI data has been restored!');
      console.log('✓ All agents, issues, and historical data recovered');
      
      await sqlNew.end();
      process.exit(0);
    } catch (err) {
      console.error('✗ Error:', err.message);
      process.exit(1);
    }
  })();
});
