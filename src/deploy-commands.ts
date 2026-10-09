import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  throw new Error("DISCORD_TOKEN, CLIENT_ID, and GUILD_ID are required");
}

const rest = new REST({ version: "10" }).setToken(token);

try {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commands.map((command) => command.data.toJSON()),
  });

  console.log("✅ Slash commands deployed");
} catch (error) {
  console.error("Gagal melakukan deploy slash commands:", error);
  process.exit(1);
}
