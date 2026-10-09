import {
  ChatInputCommandInteraction,
  DiscordAPIError,
  EmbedBuilder,
  MessageFlags,
  RESTJSONErrorCodes,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Menampilkan informasi member")
  .addUserOption((option) =>
    option
      .setName("member")
      .setDescription("Member yang ingin dilihat informasinya")
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser("member") ?? interaction.user;

  const member = await interaction.guild?.members
    .fetch(targetUser.id)
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
      content: "❌ Member tidak ditemukan di server.",
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
        name: "Nama Tampilan",
        value: member.displayName,
        inline: true,
      },
      {
        name: "Username",
        value: member.user.username,
        inline: true,
      },
      {
        name: "User ID",
        value: member.user.id,
      },
      {
        name: "📅 Akun Dibuat",
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`,
      },
      {
        name: "📥 Bergabung ke Server",
        value: member.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
          : "Tidak diketahui",
      },
      {
        name: "🚀 Server Boost",
        value: member.premiumSinceTimestamp
          ? `Sejak <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:D>`
          : "Tidak sedang boost",
      },
    )
    .setFooter({ text: "Noko • PKH Community" })
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
  });
}
