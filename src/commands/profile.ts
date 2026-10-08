import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("Menampilkan profil member");

export async function execute(interaction: ChatInputCommandInteraction) {
  const member = await interaction.guild?.members.fetch(interaction.user.id);

  if (!member) {
    await interaction.reply({
      content: "❌ Data member tidak dapat ditemukan.",
      ephemeral: true,
    });

    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`👤 ${member.displayName}`)
    .setThumbnail(member.user.displayAvatarURL())
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
    );

  await interaction.reply({
    embeds: [embed],
  });
}
