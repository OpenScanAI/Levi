import { runDatabaseRestore } from "./src/backup-lib.js";

async function main() {
  await runDatabaseRestore({
    connectionString: "postgres://postgres:postgres@127.0.0.1:54329/postgres",
    backupFile: "/tmp/restore_backup.sql",
    connectTimeoutSeconds: 30,
  });
  console.log("Restore completed successfully");
}

main().catch((err) => {
  console.error("Restore failed:", err.message);
  process.exit(1);
});
