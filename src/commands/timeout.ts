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

const MAX_TIMEOUT_MINUTES = 28 * 24 * 60;

export const data = new SlashCommandBuilder()
  .setName("timeout")
  .setDescription("Memberikan timeout kepada member")
  .addUserOption((option) =>
    option
      .setName("member")
      .setDescription("Member yang ingin di-timeout")
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("duration")
      .setDescription("Durasi timeout dalam menit")
      .setMinValue(1)
      .setMaxValue(MAX_TIMEOUT_MINUTES)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Alasan memberikan timeout")
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

  const duration = interaction.options.getInteger("duration", true);
  const targetMember = await resolveModerationTarget(interaction);

  if (!targetMember) {
    return;
  }

  if (!targetMember.moderatable) {
    await interaction.reply({
      content:
        "❌ Member tersebut tidak dapat di-timeout. Pastikan role Noko lebih tinggi dari role target.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const reason = await resolveModerationReason(interaction);

  if (!reason) {
    return;
  }

  await targetMember.timeout(duration * 60 * 1000, reason);

  await sendModLog(interaction.client, {
    action: `Timeout (${duration} menit)`,
    moderator: interaction.user.tag,
    target: targetMember.user.tag,
    reason,
  });

  await interaction.reply({
    content:
      `⏱️ **${targetMember.displayName}** telah di-timeout selama **${duration} menit**.\n` +
      `**Alasan:** ${reason}`,
    allowedMentions: { parse: [] },
  });
}
