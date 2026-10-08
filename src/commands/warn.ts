import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { sendModLog } from "../services/mod-log";

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
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)
  ) {
    await interaction.reply({
      content: "❌ Kamu tidak memiliki izin untuk menggunakan command ini.",
      ephemeral: true,
    });

    return;
  }

  const targetUser = interaction.options.getUser("member", true);
  const targetMember = await interaction.guild?.members.fetch(targetUser.id);

  if (!targetMember) {
    await interaction.reply({
      content: "❌ Member tidak ditemukan di server.",
      ephemeral: true,
    });

    return;
  }

  const reason = interaction.options.getString("reason") ?? "Tidak ada alasan";

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
  });
}
