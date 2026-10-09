import {
  ChatInputCommandInteraction,
  Client,
  DiscordAPIError,
  EmbedBuilder,
  Guild,
  GuildMember,
  MessageFlags,
  RESTJSONErrorCodes,
  TextChannel,
} from "discord.js";

export const MAX_REASON_LENGTH = 512;

export async function fetchGuildMember(
  guild: Guild | null,
  userId: string,
): Promise<GuildMember | null> {
  if (!guild) {
    return null;
  }

  return guild.members.fetch(userId).catch((error: unknown) => {
    if (
      error instanceof DiscordAPIError &&
      (error.code === RESTJSONErrorCodes.UnknownMember ||
        error.code === RESTJSONErrorCodes.UnknownUser)
    ) {
      return null;
    }

    throw error;
  });
}

export async function resolveModerationTarget(
  interaction: ChatInputCommandInteraction,
): Promise<GuildMember | null> {
  const targetUser = interaction.options.getUser("member", true);
  const targetMember = await fetchGuildMember(interaction.guild, targetUser.id);

  if (!targetMember) {
    await interaction.reply({
      content: "❌ Member tidak ditemukan di server.",
      flags: MessageFlags.Ephemeral,
    });

    return null;
  }

  if (targetMember.id === interaction.user.id) {
    await interaction.reply({
      content:
        "❌ Kamu tidak dapat melakukan tindakan moderasi terhadap diri sendiri.",
      flags: MessageFlags.Ephemeral,
    });

    return null;
  }

  if (targetMember.id === interaction.client.user?.id) {
    await interaction.reply({
      content: "❌ Kamu tidak dapat melakukan tindakan moderasi terhadap Noko.",
      flags: MessageFlags.Ephemeral,
    });

    return null;
  }

  if (targetMember.id === targetMember.guild.ownerId) {
    await interaction.reply({
      content:
        "❌ Kamu tidak dapat melakukan tindakan moderasi terhadap pemilik server.",
      flags: MessageFlags.Ephemeral,
    });

    return null;
  }

  if (interaction.user.id !== targetMember.guild.ownerId) {
    const moderatorMember =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await targetMember.guild.members.fetch(interaction.user.id);

    if (
      moderatorMember.roles.highest.comparePositionTo(
        targetMember.roles.highest,
      ) <= 0
    ) {
      await interaction.reply({
        content:
          "❌ Kamu tidak dapat menindak member dengan role yang sama atau lebih tinggi darimu.",
        flags: MessageFlags.Ephemeral,
      });

      return null;
    }
  }

  return targetMember;
}

export async function resolveModerationReason(
  interaction: ChatInputCommandInteraction,
): Promise<string | null> {
  const rawReason = interaction.options.getString("reason")?.trim();

  if (rawReason && rawReason.length > MAX_REASON_LENGTH) {
    await interaction.reply({
      content: `❌ Alasan maksimal ${MAX_REASON_LENGTH} karakter.`,
      flags: MessageFlags.Ephemeral,
    });

    return null;
  }

  return rawReason || "Tidak ada alasan";
}

export async function sendModLog(
  client: Client,
  data: {
    action: string;
    moderator: string;
    target: string;
    reason: string;
  },
) {
  const modLogChannelId = process.env.MOD_LOG_CHANNEL_ID;

  if (!modLogChannelId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(modLogChannelId);

    if (
      !channel ||
      !(channel instanceof TextChannel || channel.isSendable())
    ) {
      console.error(
        `Gagal mengirim mod log (${data.action}): channel ${modLogChannelId} tidak ditemukan atau bukan channel teks.`,
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xffdecc)
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
      .setFooter({ text: "Noko • PKH Community" })
      .setTimestamp();

    await channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error(
      `Gagal mengirim mod log untuk aksi "${data.action}" terhadap ${data.target}:`,
      error,
    );
  }
}