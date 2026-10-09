import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  MAX_REASON_LENGTH,
  resolveModerationReason,
  resolveModerationTarget,
  sendModLog,
} from "../services/mod-log";

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

  const targetMember = await resolveModerationTarget(interaction);

  if (!targetMember) {
    return;
  }

  const reason = await resolveModerationReason(interaction);

  if (!reason) {
    return;
  }

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
