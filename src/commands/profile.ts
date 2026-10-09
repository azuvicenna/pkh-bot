import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { fetchGuildMember } from "../services/mod-log";

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("Menampilkan profil member");

export async function execute(interaction: ChatInputCommandInteraction) {
  const member = await fetchGuildMember(interaction.guild, interaction.user.id);

  if (!member) {
    await interaction.reply({
      content: "❌ Data member tidak dapat ditemukan.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xffdecc)
    .setTitle(`👤 ${member.displayName}`)
    .setThumbnail(member.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name: "Username",
        value: member.user.username,
        inline: true,
      },
      {
        name: "ID",
        value: member.user.id,
        inline: true,
      },
      {
        name: "Bergabung",
        value: member.joinedAt
          ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>`
          : "Tidak diketahui",
      },
    )
    .setFooter({ text: "Noko • PKH Community" })
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
  });
}
