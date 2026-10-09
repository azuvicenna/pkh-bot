import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  Message,
  MessageFlags,
} from "discord.js";

export interface Poll {
  question: string;
  options: string[];
  votes: Map<string, number>;
  message: Message | null;
  closed?: boolean;
  pendingUpdate?: Promise<void>;
}

export const polls = new Map<string, Poll>();

export function createPollMessage(
  pollId: string,
  poll: Poll,
  closed: boolean,
  userId?: string,
) {
  const counts = poll.options.map(
    (_, index) =>
      [...poll.votes.values()].filter((vote) => vote === index).length,
  );

  const embed = new EmbedBuilder()
    .setColor(0xffdecc)
    .setTitle(`📊 ${poll.question}`)
    .setDescription(
      poll.options
        .map(
          (option, index) =>
            `**${index + 1}.** ${option}\nSuara: ${counts[index]}`,
        )
        .join("\n\n"),
    )
    .setFooter({
      text: closed
        ? `Polling ditutup • Total suara: ${poll.votes.size} • Noko`
        : `Total suara: ${poll.votes.size} • Noko`,
    });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...poll.options.map((option, index) =>
      new ButtonBuilder()
        .setCustomId(`poll:${pollId}:${index}`)
        .setLabel(option)
        .setStyle(
          !closed && userId && poll.votes.get(userId) === index
            ? ButtonStyle.Success
            : ButtonStyle.Secondary,
        )
        .setDisabled(closed),
    ),
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

export async function handlePollButton(interaction: ButtonInteraction) {
  if (interaction.replied || interaction.deferred) {
    return;
  }

  if (!interaction.customId.startsWith("poll:")) {
    return;
  }

  const parts = interaction.customId.split(":");

  if (parts.length !== 3) {
    await interaction.reply({
      content: "❌ Polling sudah ditutup atau tidak tersedia.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const [, pollId, optionIndexText] = parts;

  if (!pollId || !/^\d+$/.test(optionIndexText)) {
    await interaction.reply({
      content: "❌ Polling sudah ditutup atau tidak tersedia.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const poll = polls.get(pollId);
  const optionIndex = Number(optionIndexText);

  if (
    !poll ||
    poll.closed ||
    !Number.isInteger(optionIndex) ||
    optionIndex < 0 ||
    optionIndex >= poll.options.length ||
    (poll.message && interaction.message.id !== poll.message.id)
  ) {
    await interaction.reply({
      content: "❌ Polling sudah ditutup atau tidak tersedia.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  poll.message ??= interaction.message;
  poll.votes.set(interaction.user.id, optionIndex);

  const previousUpdate = poll.pendingUpdate ?? Promise.resolve();
  const currentUpdate = interaction.update(
    createPollMessage(pollId, poll, false, interaction.user.id),
  );

  poll.pendingUpdate = Promise.allSettled([
    previousUpdate,
    currentUpdate,
  ]).then(() => undefined);

  await currentUpdate;
}
