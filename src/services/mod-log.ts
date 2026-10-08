import {
  Client,
  EmbedBuilder,
  TextChannel,
} from "discord.js";

const MOD_LOG_CHANNEL_ID = process.env.MOD_LOG_CHANNEL_ID;

export async function sendModLog(
  client: Client,
  data: {
    action: string;
    moderator: string;
    target: string;
    reason: string;
  },
) {
  if (!MOD_LOG_CHANNEL_ID) {
    return;
  }

  const channel = await client.channels.fetch(MOD_LOG_CHANNEL_ID);

  if (!channel || !(channel instanceof TextChannel)) {
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ Moderation — ${data.action}`)
    .addFields(
      {
        name: "Moderator",
        value: data.moderator,
        inline: true,
      },
      {
        name: "Target",
        value: data.target,
        inline: true,
      },
      {
        name: "Alasan",
        value: data.reason,
      },
    )
    .setTimestamp();

  await channel.send({
    embeds: [embed],
  });
}