import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";

const MAX_TITLE_LENGTH = 256;
const MAX_MESSAGE_LENGTH = 4000;

export const data = new SlashCommandBuilder()
  .setName("announce")
  .setDescription("Mengirim pengumuman ke channel server")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Channel tujuan pengumuman")
      .addChannelTypes(0)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("title")
      .setDescription("Judul pengumuman")
      .setMinLength(1)
      .setMaxLength(MAX_TITLE_LENGTH)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("Isi pengumuman")
      .setMinLength(1)
      .setMaxLength(MAX_MESSAGE_LENGTH)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
  ) {
    await interaction.reply({
      content: "❌ Kamu tidak memiliki izin untuk menggunakan command ini.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const channel = interaction.options.getChannel("channel", true);
  const title = interaction.options.getString("title", true).trim();
  const message = interaction.options.getString("message", true).trim();

  if (!title || !message) {
    await interaction.reply({
      content: "❌ Judul dan isi pengumuman tidak boleh kosong.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (title.length > MAX_TITLE_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
    await interaction.reply({
      content: `❌ Judul maksimal ${MAX_TITLE_LENGTH} karakter dan isi pengumuman maksimal ${MAX_MESSAGE_LENGTH} karakter.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!(channel instanceof TextChannel)) {
    await interaction.reply({
      content: "❌ Pilih channel teks yang valid.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const botMember =
    channel.guild.members.me ?? (await channel.guild.members.fetchMe());
  const botPermissions = channel.permissionsFor(botMember);

  if (
    !botPermissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])
  ) {
    await interaction.reply({
      content:
        "❌ Gagal mengirim pengumuman. Pastikan Noko memiliki izin View Channel, Send Messages, dan Embed Links di channel tujuan.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xffdecc)
    .setTitle(title)
    .setDescription(message)
    .setFooter({
      text: `Pengumuman • ${interaction.guild?.name ?? "PKH"}`,
    })
    .setTimestamp();

  try {
    await channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("Gagal mengirim pengumuman:", error);

    await interaction.reply({
      content:
        "❌ Gagal mengirim pengumuman. Periksa izin bot di channel tujuan.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: `✅ Pengumuman berhasil dikirim ke ${channel}.`,
    flags: MessageFlags.Ephemeral,
  });
}
