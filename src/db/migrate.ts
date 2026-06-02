import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPool } from "./pool";
import { loadConfig } from "../config";
import { GoogleSheetsRepository } from "../repositories/google-sheets";

async function main() {
  const config = loadConfig();
  if (config.dbProvider === "sheets") {
    const repository = new GoogleSheetsRepository({
      spreadsheetId: requireEnv(config.google.sheetsId, "GOOGLE_SHEETS_ID"),
      clientEmail: requireEnv(config.google.clientEmail, "GOOGLE_CLIENT_EMAIL"),
      privateKey: requireEnv(config.google.privateKey, "GOOGLE_PRIVATE_KEY")
    });
    await repository.initialize();
    console.log("Google Sheets database initialized.");
    return;
  }

  const pool = createPool(config.databaseUrl);
  const migrationsDir = join(process.cwd(), "migrations");
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  try {
    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), "utf8");
      await pool.query(sql);
      console.log(`Applied ${file}`);
    }
    console.log("Database migration completed.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required when DB_PROVIDER=sheets.`);
  }
  return value;
}
