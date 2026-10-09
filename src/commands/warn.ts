import {
  ChatInputCommandInteraction,
  DiscordAPIError,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  SlashCommandBuilder,
} from "discord.js";
import { sendModLog } from "../services/mod-log";

const MAX_REASON_LENGTH = 512;

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Memberikan peringatan kepada member")
  .addUserOption((option) =>
    option
      .setName("member")
      .setDescription("Member yang ingin diperingatkan")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Alasan memberikan peringatan")
      .setMaxLength(MAX_REASON_LENGTH)
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)
  ) {
    await interaction.reply({
      content: "❌ Kamu tidak memiliki izin untuk menggunakan command ini.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const targetUser = interaction.options.getUser("member", true);
  const targetMember = await interaction.guild?.members
    .fetch(targetUser.id)
    .catch((error: unknown) => {
      if (
        error instanceof DiscordAPIError &&
        (error.code === RESTJSONErrorCodes.UnknownMember ||
          error.code === RESTJSONErrorCodes.UnknownUser)
      ) {
        return null;
      }

      throw error;
    });

  if (!targetMember) {
    await interaction.reply({
      content: "❌ Member tidak ditemukan di server.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  if (targetMember.id === interaction.user.id) {
    await interaction.reply({
      content:
        "❌ Kamu tidak dapat melakukan tindakan moderasi terhadap diri sendiri.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  if (targetMember.id === interaction.client.user?.id) {
    await interaction.reply({
      content: "❌ Kamu tidak dapat melakukan tindakan moderasi terhadap Noko.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  if (targetMember.id === targetMember.guild.ownerId) {
    await interaction.reply({
      content:
        "❌ Kamu tidak dapat melakukan tindakan moderasi terhadap pemilik server.",
      flags: MessageFlags.Ephemeral,
    });

    return;
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

      return;
    }
  }

  const rawReason = interaction.options.getString("reason")?.trim();

  if (rawReason && rawReason.length > MAX_REASON_LENGTH) {
    await interaction.reply({
      content: `❌ Alasan maksimal ${MAX_REASON_LENGTH} karakter.`,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const reason = rawReason || "Tidak ada alasan";

  await sendModLog(interaction.client, {
    action: "Warn",
    moderator: interaction.user.tag,
    target: targetMember.user.tag,
    reason,
  });

  await interaction.reply({
    content:
      `⚠️ **${targetMember.displayName}** telah mendapatkan peringatan.\n` +
      `**Alasan:** ${reason}`,
    allowedMentions: { parse: [] },
  });
}
