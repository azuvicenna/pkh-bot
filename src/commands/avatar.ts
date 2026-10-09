import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("avatar")
  .setDescription("Menampilkan avatar member")
  .addUserOption((option) =>
    option
      .setName("member")
      .setDescription("Member yang ingin dilihat avatarnya")
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("member") ?? interaction.user;

  const avatarURL = user.displayAvatarURL({
    size: 1024,
    extension: "png",
  });

  const embed = new EmbedBuilder()
    .setColor(0xffdecc)
    .setTitle(`🖼️ Avatar ${user.username}`)
    .setImage(avatarURL)
    .setURL(avatarURL)
    .setFooter({ text: "Noko • PKH Community" });

  await interaction.reply({
    embeds: [embed],
  });
}
