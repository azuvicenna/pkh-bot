import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

const MAX_MESSAGE_LENGTH = 1000;

export const data = new SlashCommandBuilder()
  .setName("remind")
  .setDescription("Membuat pengingat")
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("Pesan pengingat")
      .setMinLength(1)
      .setMaxLength(MAX_MESSAGE_LENGTH)
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("duration")
      .setDescription("Waktu pengingat dalam menit")
      .setMinValue(1)
      .setMaxValue(10080)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const message = interaction.options.getString("message", true).trim();
  const duration = interaction.options.getInteger("duration", true);
  const channel = interaction.channel;

  if (!message) {
    await interaction.reply({
      content: "❌ Pesan pengingat tidak boleh kosong.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    await interaction.reply({
      content: `❌ Pesan pengingat maksimal ${MAX_MESSAGE_LENGTH} karakter.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!channel?.isSendable()) {
    await interaction.reply({
      content: "❌ Channel ini tidak mendukung pengiriman pesan.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: `⏰ Pengingat berhasil dibuat! Noko akan mengingatkanmu dalam ${duration} menit.`,
    flags: MessageFlags.Ephemeral,
  });

  setTimeout(async () => {
    try {
      await channel.send({
        content: `⏰ <@${interaction.user.id}> Pengingatmu:\n${message}`,
        allowedMentions: {
          users: [interaction.user.id],
        },
      });
    } catch (error) {
      console.error("Gagal mengirim pengingat:", error);
    }
  }, duration * 60_000);
}
