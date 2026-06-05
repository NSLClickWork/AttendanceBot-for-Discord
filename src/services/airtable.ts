import Airtable from "airtable";

export interface PendingTask {
  name: string;
  deadline: string;
}

export class AirtableGateway {
  private base: Airtable.Base | null = null;

  constructor(apiKey?: string, baseId?: string) {
    if (apiKey && baseId) {
      this.base = new Airtable({ apiKey }).base(baseId);
    }
  }

  async getPendingTasks(discordUserId: string): Promise<PendingTask[]> {
    if (!this.base) return [];

    try {
      // The Assignee_Slack_ID column in Airtable holds the Discord User ID
      const records = await this.base("Tasks").select({
        filterByFormula: `AND({Status} != 'Done', {Assignee_Slack_ID} = '${discordUserId}')`,
        sort: [{ field: "Deadline", direction: "asc" }]
      }).firstPage();

      return records.map((record) => ({
        name: (record.get("Task_Name") as string) || "Unknown Task",
        deadline: (record.get("Deadline") as string) || ""
      }));
    } catch (error) {
      console.error("Error fetching tasks from Airtable:", error);
      return [];
    }
  }
}
