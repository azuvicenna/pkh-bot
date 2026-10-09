import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { polls, createPollMessage, type Poll } from "../services/poll";

const MAX_QUESTION_LENGTH = 200;
const MAX_OPTION_LENGTH = 80;

export const data = new SlashCommandBuilder()
  .setName("poll")
  .setDescription("Membuat polling di server")
  .addStringOption((option) =>
    option
      .setName("question")
      .setDescription("Pertanyaan polling")
      .setMinLength(1)
      .setMaxLength(MAX_QUESTION_LENGTH)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("option1")
      .setDescription("Pilihan pertama")
      .setMinLength(1)
      .setMaxLength(MAX_OPTION_LENGTH)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("option2")
      .setDescription("Pilihan kedua")
      .setMinLength(1)
      .setMaxLength(MAX_OPTION_LENGTH)
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("duration")
      .setDescription("Masa berlaku polling dalam menit")
      .setMinValue(1)
      .setMaxValue(10080)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("option3")
      .setDescription("Pilihan ketiga (opsional)")
      .setMinLength(1)
      .setMaxLength(MAX_OPTION_LENGTH)
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("option4")
      .setDescription("Pilihan keempat (opsional)")
      .setMinLength(1)
      .setMaxLength(MAX_OPTION_LENGTH)
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const question = interaction.options.getString("question", true).trim();

  const options = [
    interaction.options.getString("option1", true),
    interaction.options.getString("option2", true),
    interaction.options.getString("option3"),
    interaction.options.getString("option4"),
  ]
    .filter((option): option is string => option !== null)
    .map((option) => option.trim());

  if (
    !question ||
    options.length < 2 ||
    options.some((option) => option.length === 0)
  ) {
    await interaction.reply({
      content: "❌ Pertanyaan dan pilihan polling tidak boleh kosong.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (
    question.length > MAX_QUESTION_LENGTH ||
    options.some((option) => option.length > MAX_OPTION_LENGTH)
  ) {
    await interaction.reply({
      content: `❌ Pertanyaan maksimal ${MAX_QUESTION_LENGTH} karakter dan setiap pilihan maksimal ${MAX_OPTION_LENGTH} karakter.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const durationMinutes = interaction.options.getInteger("duration", true);
  const pollId = interaction.id;

  const poll: Poll = {
    question,
    options,
    votes: new Map<string, number>(),
    message: null,
    closed: false,
  };

  const initialMessage = createPollMessage(pollId, poll, false);

  polls.set(pollId, poll);

  try {
    await interaction.reply({
      embeds: [initialMessage.embeds[0] as EmbedBuilder],
      components: initialMessage.components,
    });
  } catch (error) {
    polls.delete(pollId);
    throw error;
  }

  setTimeout(async () => {
    const activePoll = polls.get(pollId);
    polls.delete(pollId);

    if (!activePoll) {
      return;
    }

    activePoll.closed = true;

    if (activePoll.pendingUpdate) {
      await activePoll.pendingUpdate;
    }

    if (!activePoll.message) {
      activePoll.message = await interaction.fetchReply().catch((error) => {
        console.error(
          `Gagal mengambil pesan polling ${pollId} saat penutupan:`,
          error,
        );
        return null;
      });
    }

    if (!activePoll.message) {
      return;
    }

    try {
      await activePoll.message.edit(
        createPollMessage(pollId, activePoll, true),
      );
    } catch (error) {
      console.error(`Gagal menutup polling ${pollId}:`, error);
    }
  }, durationMinutes * 60_000);

  poll.message = await interaction.fetchReply().catch((error) => {
    console.error(`Gagal mengambil pesan polling ${pollId}:`, error);
    return poll.message;
  });
}
