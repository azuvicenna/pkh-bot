import "dotenv/config";
import { Client, Collection, GatewayIntentBits, MessageFlags } from "discord.js";
import { commands } from "./commands";
import { antiSpamService } from "./services/anti-spam";
import { handlePollButton } from "./services/poll";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("DISCORD_TOKEN is not defined");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

const commandCollection = new Collection<string, (typeof commands)[number]>();

for (const command of commands) {
  commandCollection.set(command.data.name, command);
}

client.once("clientReady", (client) => {
  console.log(`🦌 Noko is ready as ${client.user.tag}`);
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handlePollButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commandCollection.get(interaction.commandName);

    if (!command) {
      return;
    }

    const spamCheck = await antiSpamService.handleCommand(interaction);

    if (!spamCheck.allowed) {
      return;
    }

    await command.execute(interaction);
  } catch (error) {
    console.error("Gagal memproses interaksi:", error);

    if (
      !interaction.isRepliable() ||
      interaction.replied ||
      interaction.deferred
    ) {
      return;
    }

    await interaction
      .reply({
        content: "❌ Terjadi kesalahan saat menjalankan perintah ini.",
        flags: MessageFlags.Ephemeral,
      })
      .catch((replyError) => {
        console.error("Gagal mengirim respons error interaksi:", replyError);
      });
  }
});

client.on("guildMemberAdd", async (member) => {
  const channelId = process.env.WELCOME_CHANNEL_ID;
  const roleId = process.env.MEMBER_ROLE_ID;

  if (channelId) {
    try {
      const channel = await member.guild.channels.fetch(channelId);

      if (!channel?.isTextBased()) {
        console.error(
          `Gagal mengirim pesan welcome: channel ${channelId} tidak ditemukan atau bukan channel teks.`,
        );
      } else {
        const rulesChannelId =
          process.env.RULES_CHANNEL_ID || "1557675333564633098";
        const registrationChannelId =
          process.env.REGISTRATION_CHANNEL_ID || "1557675408537813064";
        const roleMention = roleId ? `<@&${roleId}>` : "**Warga PKH**";

        await channel.send({
          content:
            `👋 Selamat datang ${member} di **${member.guild.name}**!\n\n` +
            `📜 Jangan lupa baca peraturan di <#${rulesChannelId}>.\n` +
            `📝 Silakan buka channel pendaftaran <#${registrationChannelId}> agar bisa mendapatkan role ${roleMention}.\n\n` +
            `💻 Semoga betah dan selamat bergabung di PKH! 🦌`,
          allowedMentions: { parse: [], users: [member.id] },
        });
      }
    } catch (error) {
      console.error("Gagal mengirim pesan welcome:", error);
    }
  }
});

client.on("guildMemberRemove", async (member) => {
  const channelId = process.env.GOODBYE_CHANNEL_ID;

  if (!channelId) {
    return;
  }

  try {
    const channel = await member.guild.channels.fetch(channelId);

    if (!channel?.isTextBased()) {
      return;
    }

    await channel.send({
      content:
        `👋 **${member.user.username}** telah meninggalkan **${member.guild.name}**.\n` +
        `Semoga sukses dan sampai jumpa kembali! 🦌`,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("Gagal memproses member keluar:", error);
  }
});

client.on("messageCreate", async (message) => {
  try {
    await antiSpamService.handleMessage(message);
  } catch (error) {
    console.error("Gagal memproses anti-spam pesan:", error);
  }
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Menerima sinyal ${signal}, menghentikan Noko...`);

  antiSpamService.destroy();

  try {
    await client.destroy();
    process.exit(0);
  } catch (error) {
    console.error("Gagal menghentikan Discord client:", error);
    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

client.login(token).catch((error) => {
  console.error("Gagal login ke Discord:", error);
  process.exit(1);
});
