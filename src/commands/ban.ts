import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { sendModLog } from "../services/mod-log";

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
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
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

  if (!targetMember.bannable) {
    await interaction.reply({
      content:
        "❌ Member tersebut tidak dapat di-ban. Pastikan role Noko lebih tinggi dari role target.",
      ephemeral: true,
    });

    return;
  }

  const reason = interaction.options.getString("reason") ?? "Tidak ada alasan";

  await targetMember.ban({ reason });

  await sendModLog(interaction.client, {
    action: "Ban",
    moderator: interaction.user.tag,
    target: targetMember.user.tag,
    reason,
  });

  await interaction.reply({
    content: `🔨 **${targetMember.displayName}** telah di-ban.\n**Alasan:** ${reason}`,
  });
}
