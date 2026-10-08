import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { sendModLog } from "../services/mod-log";

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
  const duration = interaction.options.getInteger("duration", true);
  const targetMember = await interaction.guild?.members.fetch(targetUser.id);

  if (!targetMember) {
    await interaction.reply({
      content: "❌ Member tidak ditemukan di server.",
      ephemeral: true,
    });

    return;
  }

  if (!targetMember.moderatable) {
    await interaction.reply({
      content:
        "❌ Member tersebut tidak dapat di-timeout. Pastikan role Noko lebih tinggi dari role target.",
      ephemeral: true,
    });

    return;
  }

  const reason = interaction.options.getString("reason") ?? "Tidak ada alasan";

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
  });
}
