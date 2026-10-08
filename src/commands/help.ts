import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Menampilkan daftar perintah Noko");

export async function execute(interaction: ChatInputCommandInteraction) {
  const isModerator = interaction.memberPermissions?.has(
    PermissionFlagsBits.KickMembers,
  );

  const content = [
    "🦌 **Noko — PKH Community Bot**",
    "",
    "👤 **Perintah Member**",
    "`/help` — Menampilkan bantuan",
    "`/rules` — Menampilkan peraturan server",
    "`/profile` — Menampilkan profil member",
  ];

  if (isModerator) {
    content.push(
      "",
      "🛡️ **Perintah Moderasi**",
      "`/kick` — Mengeluarkan member",
      "`/ban` — Memblokir member",
      "`/timeout` — Memberikan timeout",
      "`/warn` — Memberikan peringatan",
    );
  }

  await interaction.reply({
    content: content.join("\n"),
    ephemeral: true,
  });
}
