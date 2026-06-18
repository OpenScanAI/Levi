import { runDatabaseRestore } from "./dist/backup-lib.js";

async function main() {
  console.log("Starting restore from: paperclip-20260527-132203.sql.gz");
  await runDatabaseRestore({
    connectionString: "postgres://postgres@127.0.0.1:54329/postgres",
    backupFile: "/home/daksh/.paperclip/instances/default/data/backups/paperclip-20260527-132203.sql.gz",
    connectTimeoutSeconds: 60,
  });
  console.log("Restore completed successfully");
}

main().catch((err: Error) => {
  console.error("Restore failed:", err.message);
  process.exit(1);
});
