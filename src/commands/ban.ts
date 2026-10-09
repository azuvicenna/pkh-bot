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
  .setName("ban")
  .setDescription("Memblokir member dari server")
  .addUserOption((option) =>
    option
      .setName("member")
      .setDescription("Member yang ingin diban")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Alasan melakukan ban")
      .setMaxLength(MAX_REASON_LENGTH)
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
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

  if (!targetMember.bannable) {
    await interaction.reply({
      content:
        "❌ Member tersebut tidak dapat di-ban. Pastikan role Noko lebih tinggi dari role target.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const reason = await resolveModerationReason(interaction);

  if (!reason) {
    return;
  }

  await targetMember.ban({ reason });

  await sendModLog(interaction.client, {
    action: "Ban",
    moderator: interaction.user.tag,
    target: targetMember.user.tag,
    reason,
  });

  await interaction.reply({
    content: `🔨 **${targetMember.displayName}** telah di-ban.\n**Alasan:** ${reason}`,
    allowedMentions: { parse: [] },
  });
}
