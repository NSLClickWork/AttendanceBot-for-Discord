# IT Attendance Discord Bot

Discord bot for IT attendance, weekly schedule submission, Google Calendar sync, and payslip PDF generation.

## Panel Features

- Check in
- Check out
- Add employee
- Delete employee
- Report OT
- Submit weekly schedule
- Delete Schedule
- Sync Calendar
- Payslip
- View Database link for managers when Google Sheets is used

The panel intentionally does not include `My attendance`, `Generate Schedule Draft`, or `Export Attendance`.

## Setup

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

When `DB_PROVIDER=sheets`, attendance data is stored in Google Sheets and Redis is used locally for reminders/jobs.

## Discord Setup

Create a Discord application and bot, then set:

```text
DISCORD_BOT_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
DISCORD_CHANNEL_ID=...
DISCORD_BOSS_USER_IDS=...
```

Recommended bot permissions:

```text
Send Messages
Use Slash Commands
Embed Links
Attach Files
Read Message History
```

Recommended intents:

```text
Message Content Intent: needed for DM chat assistant and text payslip hints
```

Use `/panel` or `/home` in Discord to open the button panel. Slash commands are registered on startup. If `DISCORD_GUILD_ID` is set, commands are registered to that server for faster development updates.

## Environment

Important variables:

- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_CHANNEL_ID`
- `DISCORD_BOSS_USER_IDS`
- `DB_PROVIDER` (`sheets` or `postgres`)
- `DATABASE_URL`
- `REDIS_URL`
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_SCHEDULE_CALENDAR_ID`
- `GOOGLE_SHEETS_ID`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

## Notes

Discord modals support only text inputs. The payslip form keeps PDF generation but groups fields into five pipe-delimited inputs. Discord does not provide modal file upload, so QR image upload is not part of the Discord modal path.
