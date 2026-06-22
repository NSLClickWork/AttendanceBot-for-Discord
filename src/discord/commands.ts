import { REST, Routes, SlashCommandBuilder } from "discord.js";

export const discordCommands = [
  new SlashCommandBuilder().setName("setup_attendance_dashboard").setDescription("Open IT attendance bot panel"),
  new SlashCommandBuilder()
    .setName("payslip")
    .setDescription("Create a payslip PDF")
    .addAttachmentOption((option) =>
      option
        .setName("qr")
        .setDescription("Upload your banking QR code image (optional)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("diemdanhbu")
    .setDescription("Retroactive check-in")
].map((command) => command.toJSON());

export async function registerDiscordCommands(input: { token: string; clientId: string; guildId?: string }) {
  const rest = new REST({ version: "10" }).setToken(input.token);
  const route = input.guildId
    ? Routes.applicationGuildCommands(input.clientId, input.guildId)
    : Routes.applicationCommands(input.clientId);
  await rest.put(route, { body: discordCommands });
}

