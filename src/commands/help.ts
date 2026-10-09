import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Menampilkan daftar perintah Noko");

export async function execute(interaction: ChatInputCommandInteraction) {
  const permissions = interaction.memberPermissions;

  const content = [
    "🦌 **Noko — PKH Community Bot**",
    "",
    "👤 **Perintah Member**",
    "`/help` — Menampilkan bantuan",
    "`/rules` — Menampilkan peraturan server",
    "`/profile` — Menampilkan profil member",
    "`/serverinfo` — Menampilkan informasi server PKH",
    "`/userinfo` — Menampilkan informasi member",
    "`/avatar` — Menampilkan avatar member",
    "`/poll` — Membuat polling di server",
    "`/remind` — Membuat pengingat",
    "`/github` — Menampilkan profil dan kontribusi GitHub",
    "`/project` — Memamerkan proyek ke channel showcase",
    "`/ai` — Bertanya kepada asisten AI Noko",
  ];

  const moderationCommands: string[] = [];

  if (permissions?.has(PermissionFlagsBits.KickMembers)) {
    moderationCommands.push("`/kick` — Mengeluarkan member");
  }

  if (permissions?.has(PermissionFlagsBits.BanMembers)) {
    moderationCommands.push("`/ban` — Memblokir member");
  }

  if (permissions?.has(PermissionFlagsBits.ModerateMembers)) {
    moderationCommands.push(
      "`/timeout` — Memberikan timeout",
      "`/warn` — Memberikan peringatan",
    );
  }

  if (permissions?.has(PermissionFlagsBits.ManageMessages)) {
    moderationCommands.push(
      "`/announce` — Mengirim pengumuman ke channel server",
    );
  }

  if (moderationCommands.length > 0) {
    content.push("", "🛡️ **Perintah Moderasi**", ...moderationCommands);
  }

  await interaction.reply({
    content: content.join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}
