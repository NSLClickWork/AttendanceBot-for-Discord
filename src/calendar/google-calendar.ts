import { google } from "googleapis";
import type { ScheduleEventDraft } from "../domain";

export interface CalendarGateway {
  createEvents(events: ScheduleEventDraft[], calendarId?: string): Promise<string[]>;
}

export class GoogleCalendarGateway implements CalendarGateway {
  constructor(
    private readonly options: {
      calendarId: string;
      clientEmail?: string;
      privateKey?: string;
      timezone: string;
      gasWebhookUrl?: string;
    }
  ) {}

  async createEvents(events: ScheduleEventDraft[], calendarId?: string): Promise<string[]> {
    if (this.options.gasWebhookUrl) {
      try {
        const response = await fetch(this.options.gasWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            events,
            calendarId: calendarId || this.options.calendarId
          })
        });
        const data = await response.json();
        if (!data.success) {
          throw new Error("GAS Webhook error: " + data.error);
        }
        return data.ids || [];
      } catch (err) {
        console.error("Failed to sync via GAS webhook:", err);
        throw err;
      }
    }

    if (!this.options.clientEmail || !this.options.privateKey) {
      console.warn("Missing Google service account credentials. Skipping calendar events creation.");
      return events.map((_, i) => `mock-event-id-${Date.now()}-${i}`);
    }

    const auth = new google.auth.JWT({
      email: this.options.clientEmail,
      key: this.options.privateKey,
      scopes: ["https://www.googleapis.com/auth/calendar"]
    });
    const calendar = google.calendar({ version: "v3", auth });
    const ids: string[] = [];

    for (const event of events) {
      const response = await calendar.events.insert({
        calendarId: calendarId || this.options.calendarId,
        requestBody: {
          summary: event.title,
          description: event.notes,
          start: {
            dateTime: event.startAt,
            timeZone: this.options.timezone
          },
          end: {
            dateTime: event.endAt,
            timeZone: this.options.timezone
          }
        }
      });
      if (response.data.id) {
        ids.push(response.data.id);
      }
    }

    return ids;
  }
}
