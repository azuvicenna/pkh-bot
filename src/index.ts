import "dotenv/config";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { commands } from "./commands";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("DISCORD_TOKEN is not defined");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const commandCollection = new Collection<string, (typeof commands)[number]>();

for (const command of commands) {
  commandCollection.set(command.data.name, command);
}

client.once("clientReady", (client) => {
  console.log(`🦌 Noko is ready as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commandCollection.get(interaction.commandName);

  if (!command) {
    return;
  }

  await command.execute(interaction);
});

client.on("guildMemberAdd", async (member) => {
  const channelId = process.env.WELCOME_CHANNEL_ID;
  const roleId = process.env.MEMBER_ROLE_ID;

  if (!channelId || !roleId) {
    return;
  }

  const channel = await member.guild.channels.fetch(channelId);

  if (channel?.isTextBased()) {
    await channel.send({
      content:
        `👋 Selamat datang ${member} di **${member.guild.name}**!\n\n` +
        `🦌 Jangan lupa baca <#1557675333564633098> dan pilih role kamu.\n` +
        `💻 Semoga betah dan selamat bergabung di PKH!`,
    });
  }

  const role = member.guild.roles.cache.get(roleId);

  if (!role) {
    return;
  }

  await member.roles.add(role);
});

client.on("guildMemberRemove", async (member) => {
  const channelId = process.env.GOODBYE_CHANNEL_ID;

  if (!channelId) {
    return;
  }

  const channel = await member.guild.channels.fetch(channelId);

  if (!channel?.isTextBased()) {
    return;
  }

  await channel.send({
    content:
      `👋 **${member.user.username}** telah meninggalkan **${member.guild.name}**.\n` +
      `Semoga sukses dan sampai jumpa kembali! 🦌`,
  });
});

client.login(token);
