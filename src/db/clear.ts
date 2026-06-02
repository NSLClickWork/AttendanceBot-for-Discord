import { loadConfig } from "../config";
import { google } from "googleapis";

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function main() {
  const config = loadConfig();
  if (config.dbProvider !== "sheets") {
    console.log("Database provider is not sheets. Skipping Google Sheets reset.");
    return;
  }

  const spreadsheetId = requireEnv(config.google.sheetsId, "GOOGLE_SHEETS_ID");
  const clientEmail = requireEnv(config.google.clientEmail, "GOOGLE_CLIENT_EMAIL");
  const privateKey = requireEnv(config.google.privateKey, "GOOGLE_PRIVATE_KEY");

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  const sheets = google.sheets({ version: "v4", auth });

  const TABLES = [
    "employees",
    "attendance_sessions",
    "ot_requests",
    "weekly_availability",
    "schedule_drafts",
    "audit_logs",
    "bot_usage_events"
  ];

  console.log("Clearing all data rows in Google Sheets database...");

  for (const table of TABLES) {
    try {
      // Clear all cells starting from row 2 to preserve the headers
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${table}'!A2:Z10000`
      });
      console.log(`Successfully cleared data row values for: ${table}`);
    } catch (error: any) {
      console.warn(`Could not clear sheet '${table}': ${error.message}`);
    }
  }

  console.log("Google Sheets database has been completely reset.");
}

main().catch((error) => {
  console.error("Failed to reset Google Sheets database:", error);
  process.exit(1);
});
