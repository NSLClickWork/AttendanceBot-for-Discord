import type { AvailabilitySlot } from "../domain";

export function parseDateTime(input: string): Date {
  const normalized = input.trim().replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${input}`);
  }
  return date;
}

export function getTzOffset(timeZone: string, date = new Date()): string {
  const str = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);

  const [datePart, timePart] = str.split(", ");
  const [yyyy, mm, dd] = datePart.split("-");
  const [hr, min, sec] = timePart.split(":");

  const localAsUtc = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hr), Number(min), Number(sec));
  const diffMinutes = Math.round((localAsUtc - date.getTime()) / 60000);

  const sign = diffMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(diffMinutes);
  const h = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const m = String(absMinutes % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

export function parseDateTimeInTz(input: string, timeZone: string): Date {
  const normalized = input.trim().replace(" ", "T");
  if (normalized.includes("+") || (normalized.includes("-") && normalized.lastIndexOf("-") > 10)) {
    return parseDateTime(input);
  }
  const offset = getTzOffset(timeZone);
  return parseDateTime(`${normalized}${offset}`);
}

export function getTodayStrInTz(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function parseSlotLines(input: string): AvailabilitySlot[] {
  if (!input.trim()) return [];

  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
      if (!match) {
        throw new Error(`Invalid slot line: ${line}`);
      }
      return {
        day: match[1],
        start: match[2],
        end: match[3]
      };
    });
}

export function nextMondayIso(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + daysUntilMonday);
  return date.toISOString().slice(0, 10);
}
