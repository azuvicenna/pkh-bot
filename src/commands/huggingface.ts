import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

const HUGGINGFACE_BASE_URL = "https://huggingface.co";
const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_USERNAME_LENGTH = 42;
const HUGGINGFACE_USERNAME_REGEX =
  /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,41}$/;
const RATE_LIMIT_PATTERN = /rate limit|too many requests/i;

export interface HuggingFaceUserProfile {
  username: string;
  fullname: string | null;
  bio: string | null;
  avatarUrl: string | null;
  url: string;
  isPro: boolean;
  publicModels: number | null;
  publicDatasets: number | null;
  publicSpaces: number | null;
  followers: number | null;
  following: number | null;
  likes: number | null;
}

interface HuggingFaceOverviewResponse {
  user?: unknown;
  fullname?: unknown;
  details?: unknown;
  avatarUrl?: unknown;
  isPro?: unknown;
  type?: unknown;
  numModels?: unknown;
  numDatasets?: unknown;
  numSpaces?: unknown;
  numFollowers?: unknown;
  numFollowing?: unknown;
  numLikes?: unknown;
  error?: unknown;
  message?: unknown;
}

export type HuggingFaceFetchResult =
  | {
      ok: true;
      profile: HuggingFaceUserProfile;
    }
  | {
      ok: false;
      userMessage: string;
    };

export function isValidHuggingFaceUsername(username: string): boolean {
  if (typeof username !== "string" || /\s/.test(username)) {
    return false;
  }

  return HUGGINGFACE_USERNAME_REGEX.test(username);
}

export function resolveHuggingFaceAvatarUrl(
  rawAvatarUrl: string | null | undefined,
): string | null {
  if (typeof rawAvatarUrl !== "string") {
    return null;
  }

  const trimmed = rawAvatarUrl.trim();

  if (!trimmed || /\s/.test(trimmed)) {
    return null;
  }

  const isAbsoluteHttp =
    trimmed.startsWith("https://") || trimmed.startsWith("http://");
  const isRootRelative =
    trimmed.startsWith("/") && !trimmed.startsWith("//");

  if (!isAbsoluteHttp && !isRootRelative) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, HUGGINGFACE_BASE_URL);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    if (parsed.pathname.toLowerCase().endsWith(".svg")) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function parseStatCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function formatStatCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "Tidak tersedia";
  }

  return value.toLocaleString("id-ID");
}

export function isRateLimitError(
  status: number,
  headers: Headers,
  bodyMessage?: string,
): boolean {
  if (status === 429) {
    return true;
  }

  if (status === 403) {
    const remaining = headers.get("x-ratelimit-remaining");
    const retryAfter = headers.get("retry-after");
    const rateLimitHeader = headers.get("ratelimit");

    if (
      remaining === "0" ||
      (retryAfter !== null && retryAfter.trim() !== "") ||
      (rateLimitHeader !== null && /\br=0\b/i.test(rateLimitHeader))
    ) {
      return true;
    }

    return (
      typeof bodyMessage === "string" && RATE_LIMIT_PATTERN.test(bodyMessage)
    );
  }

  return false;
}

export async function fetchHuggingFaceProfile(
  username: string,
  options?: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<HuggingFaceFetchResult> {
  const normalizedUsername = username.trim();

  if (!isValidHuggingFaceUsername(normalizedUsername)) {
    return {
      ok: false,
      userMessage: "❌ Format username Hugging Face tidak valid.",
    };
  }

  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const fetchFn = options?.fetchImpl ?? fetch;
  const endpoint = `${HUGGINGFACE_BASE_URL}/api/users/${encodeURIComponent(normalizedUsername)}/overview`;

  let response: Response;

  try {
    response = await fetchFn(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Noko-PKH-Bot",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      return {
        ok: false,
        userMessage:
          "❌ Permintaan ke Hugging Face melewati batas waktu (timeout). Silakan coba lagi.",
      };
    }

    const safeMessage =
      error instanceof Error ? error.message : "Unknown network error";
    console.error("Gagal menghubungi Hugging Face API:", safeMessage);

    return {
      ok: false,
      userMessage:
        "❌ Gagal terhubung ke Hugging Face API. Silakan coba beberapa saat lagi.",
    };
  }

  let payload: HuggingFaceOverviewResponse | null = null;

  try {
    payload = (await response.json()) as HuggingFaceOverviewResponse;
  } catch {
    payload = null;
  }

  const errorText =
    typeof payload?.error === "string"
      ? payload.error
      : typeof payload?.message === "string"
        ? payload.message
        : undefined;

  if (isRateLimitError(response.status, response.headers, errorText)) {
    return {
      ok: false,
      userMessage:
        "⏳ Batas permintaan (rate limit) Hugging Face API sedang tercapai. Silakan coba beberapa saat lagi.",
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      userMessage: `❌ Pengguna Hugging Face **${normalizedUsername}** tidak ditemukan.`,
    };
  }

  if (!response.ok) {
    const safeDetail = errorText || response.statusText || "HTTP Error";
    console.error(
      `Hugging Face API mengembalikan HTTP ${response.status}: ${safeDetail}`,
    );

    return {
      ok: false,
      userMessage: "❌ Gagal mengambil data dari Hugging Face API.",
    };
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    console.error("Respons Hugging Face API tidak valid (bukan objek JSON).");
    return {
      ok: false,
      userMessage: "❌ Gagal memproses respons dari Hugging Face API.",
    };
  }

  const canonicalUser =
    typeof payload.user === "string" ? payload.user.trim() : "";

  if (
    !canonicalUser ||
    !isValidHuggingFaceUsername(canonicalUser) ||
    (payload.type !== undefined && payload.type !== "user")
  ) {
    console.error(
      "Respons Hugging Face API tidak memiliki field wajib yang valid.",
    );
    return {
      ok: false,
      userMessage: "❌ Gagal memproses respons dari Hugging Face API.",
    };
  }

  const fullname =
    typeof payload.fullname === "string"
      ? payload.fullname.trim() || null
      : null;
  const bio =
    typeof payload.details === "string" ? payload.details.trim() || null : null;
  const rawAvatarUrl =
    typeof payload.avatarUrl === "string" ? payload.avatarUrl : null;

  return {
    ok: true,
    profile: {
      username: canonicalUser,
      fullname,
      bio,
      avatarUrl: resolveHuggingFaceAvatarUrl(rawAvatarUrl),
      url: `${HUGGINGFACE_BASE_URL}/${encodeURIComponent(canonicalUser)}`,
      isPro: payload.isPro === true,
      publicModels: parseStatCount(payload.numModels),
      publicDatasets: parseStatCount(payload.numDatasets),
      publicSpaces: parseStatCount(payload.numSpaces),
      followers: parseStatCount(payload.numFollowers),
      following: parseStatCount(payload.numFollowing),
      likes: parseStatCount(payload.numLikes),
    },
  };
}

export function buildHuggingFaceEmbed(
  profile: HuggingFaceUserProfile,
): EmbedBuilder {
  const trimmedName = profile.fullname?.trim() || "";
  const displayName = trimmedName || "Tidak diatur";
  const bio = profile.bio?.trim() || "Tidak ada bio.";
  const title = trimmedName
    ? `🤗 ${trimmedName} (${profile.username})`
    : `🤗 ${profile.username}`;
  const thumbnailUrl = resolveHuggingFaceAvatarUrl(profile.avatarUrl);

  const embed = new EmbedBuilder()
    .setColor(0xffdecc)
    .setTitle(title)
    .setURL(profile.url)
    .setDescription(bio)
    .addFields(
      {
        name: "Nama",
        value: displayName,
        inline: true,
      },
      {
        name: "Username",
        value: profile.username,
        inline: true,
      },
      {
        name: "🔗 Profil",
        value: `[Lihat di Hugging Face](${profile.url})`,
        inline: true,
      },
      {
        name: "🤖 Model Publik",
        value: formatStatCount(profile.publicModels),
        inline: true,
      },
      {
        name: "📊 Dataset Publik",
        value: formatStatCount(profile.publicDatasets),
        inline: true,
      },
      {
        name: "🚀 Spaces Publik",
        value: formatStatCount(profile.publicSpaces),
        inline: true,
      },
      {
        name: "👥 Followers",
        value: formatStatCount(profile.followers),
        inline: true,
      },
      {
        name: "👣 Following",
        value: formatStatCount(profile.following),
        inline: true,
      },
      {
        name: "❤️ Likes",
        value: formatStatCount(profile.likes),
        inline: true,
      },
    )
    .setFooter({ text: "Noko • PKH Community" })
    .setTimestamp();

  if (thumbnailUrl) {
    embed.setThumbnail(thumbnailUrl);
  }

  return embed;
}

export const data = new SlashCommandBuilder()
  .setName("huggingface")
  .setDescription("Menampilkan profil publik pengguna Hugging Face")
  .addStringOption((option) =>
    option
      .setName("username")
      .setDescription("Username Hugging Face yang ingin dilihat")
      .setMinLength(1)
      .setMaxLength(MAX_USERNAME_LENGTH)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const username = interaction.options.getString("username", true).trim();

  if (!isValidHuggingFaceUsername(username)) {
    await interaction.reply({
      content: "❌ Format username Hugging Face tidak valid.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const result = await fetchHuggingFaceProfile(username);

    if (!result.ok) {
      await interaction.editReply({
        content: result.userMessage,
        allowedMentions: { parse: [] },
      });
      return;
    }

    await interaction.editReply({
      embeds: [buildHuggingFaceEmbed(result.profile)],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    const safeError =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Gagal menjalankan command /huggingface:", safeError);

    await interaction
      .editReply({
        content: "❌ Terjadi kesalahan saat mengambil profil Hugging Face.",
        allowedMentions: { parse: [] },
      })
      .catch((editError) => {
        console.error(
          "Gagal mengirim respons error /huggingface:",
          editError,
        );
      });
  }
}
