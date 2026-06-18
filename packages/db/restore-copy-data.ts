import { createReadStream } from "fs";
import { createGunzip } from "zlib";
import { createInterface } from "readline";
import postgres from "postgres";

const BACKUP_FILE = "/home/daksh/.paperclip/instances/default/data/backups/paperclip-20260527-132203.sql.gz";

interface CopyBlock {
  table: string;
  columns: string[];
  rows: string[][];
}

async function* readCopyBlocks(backupFile: string): AsyncGenerator<CopyBlock> {
  const raw = createReadStream(backupFile);
  const stream = raw.pipe(createGunzip());
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  let currentBlock: CopyBlock | null = null;

  for await (const line of lines) {
    if (line.startsWith("COPY ")) {
      // Parse: COPY "schema"."table" ("col1", "col2") FROM stdin;
      const match = line.match(/COPY\s+"?([^"]+)"?\."?([^"]+)"?\s+\(([^)]+)\)\s+FROM\s+stdin;/);
      if (match) {
        const schema = match[1];
        const table = match[2];
        const columns = match[3].split(",").map(c => c.trim().replace(/"/g, ""));
        currentBlock = {
          table: `${schema}.${table}`,
          columns,
          rows: [],
        };
      }
      continue;
    }

    if (line === "\\.") {
      if (currentBlock && currentBlock.rows.length > 0) {
        yield currentBlock;
      }
      currentBlock = null;
      continue;
    }

    if (currentBlock) {
      // Parse tab-separated values, handling \N for NULL
      const values = line.split("\t").map(v => v === "\\N" ? null : v);
      currentBlock.rows.push(values);
    }
  }

  stream.destroy();
  raw.destroy();
}

async function restore() {
  const sql = postgres("postgres://postgres@127.0.0.1:54329/postgres", {
    max: 1,
    connect_timeout: 30,
    onnotice: () => {},
  });

  try {
    await sql`SELECT 1`;
    console.log("Connected to database");

    let totalRows = 0;
    let totalBlocks = 0;

    for await (const block of readCopyBlocks(BACKUP_FILE)) {
      totalBlocks++;
      console.log(`Processing ${block.table}: ${block.rows.length} rows...`);

      // Build INSERT statement with ON CONFLICT DO NOTHING
      const columns = block.columns.map(c => `"${c}"`).join(", ");
      const placeholders = block.columns.map((_, i) => `$${i + 1}`).join(", ");

      // Insert in batches of 100
      const batchSize = 100;
      for (let i = 0; i < block.rows.length; i += batchSize) {
        const batch = block.rows.slice(i, i + batchSize);
        
        for (const row of batch) {
          try {
            await sql.unsafe(
              `INSERT INTO ${block.table} (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
              row
            );
            totalRows++;
          } catch (err: any) {
            console.error(`Error inserting into ${block.table}: ${err.message.slice(0, 100)}`);
          }
        }
      }
    }

    console.log(`\nRestore completed. ${totalBlocks} tables processed. ${totalRows} rows inserted.`);
  } finally {
    await sql.end();
  }
}

restore().catch((err) => {
  console.error("Restore failed:", err.message);
  process.exit(1);
});
