import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";

export const MAX_NAME_LENGTH = 150;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_URL_LENGTH = 500;
export const MAX_TECH_LENGTH = 300;

export interface ProjectEmbedInput {
  nama: string;
  deskripsi: string;
  url: string;
  teknologi: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string;
}

export function parseProjectUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();

  if (!trimmed || trimmed.length > MAX_URL_LENGTH || /\s/.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const hostname = parsed.hostname;

    if (
      !hostname ||
      hostname.startsWith(".") ||
      hostname.endsWith(".") ||
      (hostname !== "localhost" && !hostname.includes("."))
    ) {
      return null;
    }

    return parsed.toString().replace(/\(/g, "%28").replace(/\)/g, "%29");
  } catch {
    return null;
  }
}

export function buildProjectEmbed(input: ProjectEmbedInput): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xffdecc)
    .setTitle(`🚀 ${input.nama}`)
    .setURL(input.url)
    .setDescription(input.deskripsi)
    .setThumbnail(input.authorAvatarUrl)
    .addFields(
      {
        name: "🛠️ Teknologi",
        value: input.teknologi,
      },
      {
        name: "🔗 Link Proyek",
        value: `[Buka Proyek](${input.url})`,
        inline: true,
      },
      {
        name: "👤 Pengirim",
        value: `<@${input.authorId}> (${input.authorUsername})`,
        inline: true,
      },
    )
    .setFooter({ text: "Noko • PKH Community" })
    .setTimestamp();
}

async function replyEphemeral(
  interaction: ChatInputCommandInteraction,
  content: string,
) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content });
    return;
  }

  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
  });
}

export const data = new SlashCommandBuilder()
  .setName("project")
  .setDescription("Memamerkan proyek ke channel showcase")
  .addStringOption((option) =>
    option
      .setName("nama")
      .setDescription("Nama proyek")
      .setMinLength(1)
      .setMaxLength(MAX_NAME_LENGTH)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("deskripsi")
      .setDescription("Deskripsi singkat proyek")
      .setMinLength(1)
      .setMaxLength(MAX_DESCRIPTION_LENGTH)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("url")
      .setDescription("Tautan proyek (http:// atau https://)")
      .setMinLength(1)
      .setMaxLength(MAX_URL_LENGTH)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("teknologi")
      .setDescription("Teknologi yang digunakan (contoh: TypeScript, Bun)")
      .setMinLength(1)
      .setMaxLength(MAX_TECH_LENGTH)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;

  if (!guild) {
    await replyEphemeral(
      interaction,
      "❌ Command ini hanya bisa digunakan di server.",
    );
    return;
  }

  const nama = interaction.options.getString("nama", true).trim();
  const deskripsi = interaction.options.getString("deskripsi", true).trim();
  const rawUrl = interaction.options.getString("url", true).trim();
  const teknologi = interaction.options.getString("teknologi", true).trim();

  if (!nama || !deskripsi || !rawUrl || !teknologi) {
    await replyEphemeral(
      interaction,
      "❌ Nama, deskripsi, URL, dan teknologi proyek tidak boleh kosong.",
    );
    return;
  }

  if (
    nama.length > MAX_NAME_LENGTH ||
    deskripsi.length > MAX_DESCRIPTION_LENGTH ||
    rawUrl.length > MAX_URL_LENGTH ||
    teknologi.length > MAX_TECH_LENGTH
  ) {
    await replyEphemeral(
      interaction,
      `❌ Panjang input melebihi batas (nama maks ${MAX_NAME_LENGTH}, deskripsi maks ${MAX_DESCRIPTION_LENGTH}, URL maks ${MAX_URL_LENGTH}, teknologi maks ${MAX_TECH_LENGTH} karakter).`,
    );
    return;
  }

  const validatedUrl = parseProjectUrl(rawUrl);

  if (!validatedUrl) {
    await replyEphemeral(
      interaction,
      "❌ URL proyek tidak valid. Gunakan URL dengan awalan http:// atau https://.",
    );
    return;
  }

  const channelId = process.env.PAMER_PROJECT_CHANNEL_ID?.trim();

  if (!channelId) {
    console.error("PAMER_PROJECT_CHANNEL_ID belum dikonfigurasi pada environment.");
    await replyEphemeral(
      interaction,
      "❌ Channel pamer project belum dikonfigurasi di server.",
    );
    return;
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);

  if (!(channel instanceof TextChannel)) {
    await replyEphemeral(
      interaction,
      "❌ Channel pamer project tidak ditemukan atau bukan channel teks yang valid.",
    );
    return;
  }

  const botMember =
    channel.guild.members.me ??
    (await channel.guild.members.fetchMe().catch(() => null));
  const botPermissions = botMember ? channel.permissionsFor(botMember) : null;

  if (
    !botPermissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])
  ) {
    await replyEphemeral(
      interaction,
      "❌ Gagal mengirim proyek. Pastikan Noko memiliki izin View Channel, Send Messages, dan Embed Links di channel tujuan.",
    );
    return;
  }

  const embed = buildProjectEmbed({
    nama,
    deskripsi,
    url: validatedUrl,
    teknologi,
    authorId: interaction.user.id,
    authorUsername: interaction.user.username,
    authorAvatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
  });

  try {
    await channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("Gagal mengirim proyek ke channel showcase:", error);
    await replyEphemeral(
      interaction,
      "❌ Gagal mengirim proyek. Periksa izin bot di channel tujuan.",
    );
    return;
  }

  await replyEphemeral(
    interaction,
    `✅ Proyek **${nama}** berhasil dikirim ke ${channel}.`,
  );
}
