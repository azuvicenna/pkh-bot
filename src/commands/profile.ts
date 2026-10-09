import {
  ChatInputCommandInteraction,
  DiscordAPIError,
  EmbedBuilder,
  MessageFlags,
  RESTJSONErrorCodes,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("Menampilkan profil member");

export async function execute(interaction: ChatInputCommandInteraction) {
  const member = await interaction.guild?.members
    .fetch(interaction.user.id)
    .catch((error: unknown) => {
      if (
        error instanceof DiscordAPIError &&
        (error.code === RESTJSONErrorCodes.UnknownMember ||
          error.code === RESTJSONErrorCodes.UnknownUser)
      ) {
        return null;
      }

      throw error;
    });

  if (!member) {
    await interaction.reply({
      content: "❌ Data member tidak dapat ditemukan.",
      flags: MessageFlags.Ephemeral,
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
