import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("daftar")
  .setDescription("Mendaftar sebagai Warga PKH")
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: "❌ Command ini hanya bisa digunakan di server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const registrationChannelId =
    process.env.REGISTRATION_CHANNEL_ID?.trim() || "1557675408537813064";

  if (registrationChannelId && interaction.channelId !== registrationChannelId) {
    await interaction.reply({
      content: "⚠️ Command /daftar hanya dapat digunakan di channel pendaftaran.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const roleId = process.env.MEMBER_ROLE_ID?.trim();

  if (!roleId) {
    await interaction.reply({
      content: "❌ Role Warga PKH belum dikonfigurasi di bot. Silakan hubungi admin.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member =
    interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (!member) {
    await interaction.reply({
      content: "❌ Tidak dapat memverifikasi profil member kamu di server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const role =
    interaction.guild.roles.cache.get(roleId) ??
    (await interaction.guild.roles.fetch(roleId).catch(() => null));

  if (!role) {
    await interaction.reply({
      content: "❌ Role Warga PKH tidak ditemukan di server ini. Silakan hubungi admin.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (member.roles.cache.has(role.id)) {
    await interaction.reply({
      content: "Kamu sudah menjadi **Warga PKH**. Tidak perlu melakukan pendaftaran ulang.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const botMember =
    interaction.guild.members.me ??
    (await interaction.guild.members.fetchMe().catch(() => null));

  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: "❌ Bot tidak memiliki izin untuk mengelola role. Silakan hubungi admin.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    await interaction.reply({
      content:
        "❌ Posisi role bot berada di bawah atau setara dengan role Warga PKH. Silakan hubungi admin untuk menaikkan posisi role bot.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await member.roles.add(role);

    await interaction.reply({
      content:
        "**Pendaftaran berhasil! 🎉**\n\n" +
        "Kamu sekarang resmi menjadi **Warga PKH**. Selamat bergabung di Program Koding Harian!",
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error("Gagal memberikan role Warga PKH kepada member:", error);

    if (interaction.replied || interaction.deferred) {
      await interaction
        .followUp({
          content: "❌ Terjadi kesalahan saat memproses pendaftaran. Silakan coba lagi nanti.",
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
    } else {
      await interaction
        .reply({
          content: "❌ Terjadi kesalahan saat memproses pendaftaran. Silakan coba lagi nanti.",
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
    }
  }
}
