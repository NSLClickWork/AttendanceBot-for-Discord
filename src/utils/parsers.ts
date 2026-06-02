import type { AvailabilitySlot } from "../domain";

export function parseDateTime(input: string): Date {
  const normalized = input.trim().replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${input}`);
  }
  return date;
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
