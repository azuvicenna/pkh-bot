import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("rules")
  .setDescription("Menampilkan peraturan server PKH");

export async function execute(
  interaction: ChatInputCommandInteraction,
) {
  await interaction.reply({
    content: [
      "📜 **Peraturan Server PKH**",
      "",
      "1. 🤝 Saling menghormati sesama member.",
      "2. 🚫 Dilarang melakukan spam, scam, atau promosi tanpa izin.",
      "3. 🔞 Dilarang mengirim konten NSFW.",
      "4. 💻 Gunakan channel sesuai topik.",
      "5. 🦌 Ikuti arahan moderator dan Discord ToS.",
      "",
      "Dengan berada di server ini, kamu dianggap telah menyetujui peraturan yang berlaku.",
    ].join("\n"),
  });
}