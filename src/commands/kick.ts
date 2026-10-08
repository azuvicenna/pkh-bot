import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { sendModLog } from "../services/mod-log";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Mengeluarkan member dari server")
  .addUserOption((option) =>
    option
      .setName("member")
      .setDescription("Member yang ingin dikeluarkan")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Alasan mengeluarkan member")
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.KickMembers)) {
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

  if (!targetMember.kickable) {
    await interaction.reply({
      content:
        "❌ Member tersebut tidak dapat di-kick. Pastikan role Noko lebih tinggi dari role target.",
      ephemeral: true,
    });

    return;
  }

  const reason = interaction.options.getString("reason") ?? "Tidak ada alasan";

  await targetMember.kick(reason);

  await sendModLog(interaction.client, {
    action: "Kick",
    moderator: interaction.user.tag,
    target: targetMember.user.tag,
    reason,
  });

  await interaction.reply({
    content: `👢 **${targetMember.displayName}** telah dikeluarkan.\n**Alasan:** ${reason}`,
  });
}
