import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("serverinfo")
  .setDescription("Menampilkan informasi server PKH");

export async function execute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;

  if (!guild) {
    await interaction.reply({
      content: "❌ Command ini hanya bisa digunakan di server.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const owner = await guild.fetchOwner();

  const embed = new EmbedBuilder()
    .setColor(0xffdecc)
    .setTitle(`📊 Informasi ${guild.name}`)
    .setThumbnail(guild.iconURL({ size: 256 }))
    .addFields(
      {
        name: "👑 Pemilik Server",
        value: owner.user.tag,
        inline: true,
      },
      {
        name: "👥 Jumlah Member",
        value: guild.memberCount.toLocaleString("id-ID"),
        inline: true,
      },
      {
        name: "🚀 Server Boost",
        value: `${guild.premiumSubscriptionCount ?? 0}`,
        inline: true,
      },
      {
        name: "📅 Server Dibuat",
        value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
      },
      {
        name: "🆔 Server ID",
        value: guild.id,
      },
    )
    .setFooter({ text: "Noko • PKH Community" })
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
  });
}
