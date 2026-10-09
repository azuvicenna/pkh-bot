import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_USERNAME_LENGTH = 39;
const GITHUB_USERNAME_REGEX =
  /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/;
const RATE_LIMIT_PATTERN = /rate limit|secondary rate limit|abuse detection/i;

const GITHUB_PROFILE_QUERY = `
  query GetGitHubUserProfile($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      login
      name
      bio
      avatarUrl(size: 256)
      url
      repositories(privacy: PUBLIC) {
        totalCount
      }
      followers {
        totalCount
      }
      following {
        totalCount
      }
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
      }
    }
  }
`;

export interface GitHubUserProfile {
  login: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string;
  url: string;
  publicRepos: number;
  followers: number;
  following: number;
  totalCommitContributions: number;
}

interface GitHubGraphQLError {
  message?: string;
  type?: string;
}

interface GitHubGraphQLResponse {
  message?: string;
  data?: {
    user: {
      login: string;
      name: string | null;
      bio: string | null;
      avatarUrl: string;
      url: string;
      repositories: { totalCount: number };
      followers: { totalCount: number };
      following: { totalCount: number };
      contributionsCollection: { totalCommitContributions: number };
    } | null;
  } | null;
  errors?: GitHubGraphQLError[];
}

export type GitHubFetchResult =
  | {
      ok: true;
      profile: GitHubUserProfile;
      year: number;
    }
  | {
      ok: false;
      userMessage: string;
    };

export function isValidGitHubUsername(username: string): boolean {
  return GITHUB_USERNAME_REGEX.test(username.trim());
}

function redactToken(text: string, token: string): string {
  return token ? text.replaceAll(token, "[REDACTED]") : text;
}

export function isRateLimitError(
  status: number,
  headers: Headers,
  bodyMessage?: string,
  errors?: GitHubGraphQLError[],
): boolean {
  if (status === 429) {
    return true;
  }

  if (
    errors?.some(
      (err) =>
        err.type === "RATE_LIMITED" ||
        (typeof err.message === "string" &&
          RATE_LIMIT_PATTERN.test(err.message)),
    )
  ) {
    return true;
  }

  if (status === 403) {
    const remaining = headers.get("x-ratelimit-remaining");
    const retryAfter = headers.get("retry-after");

    if (remaining === "0" || (retryAfter !== null && retryAfter.trim() !== "")) {
      return true;
    }

    return (
      typeof bodyMessage === "string" && RATE_LIMIT_PATTERN.test(bodyMessage)
    );
  }

  return false;
}

export async function fetchGitHubProfile(
  username: string,
  token: string,
  options?: {
    now?: Date;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<GitHubFetchResult> {
  const now = options?.now ?? new Date();
  const year = now.getUTCFullYear();
  const from = new Date(Date.UTC(year, 0, 1)).toISOString();
  const to = now.toISOString();
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const fetchFn = options?.fetchImpl ?? fetch;

  let response: Response;

  try {
    response = await fetchFn(GITHUB_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        "User-Agent": "Noko-PKH-Bot",
      },
      body: JSON.stringify({
        query: GITHUB_PROFILE_QUERY,
        variables: { login: username, from, to },
      }),
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
          "❌ Permintaan ke GitHub melewati batas waktu (timeout). Silakan coba lagi.",
      };
    }

    const safeMessage =
      error instanceof Error
        ? redactToken(error.message, token)
        : "Unknown network error";
    console.error("Gagal menghubungi GitHub GraphQL API:", safeMessage);

    return {
      ok: false,
      userMessage:
        "❌ Gagal terhubung ke GitHub API. Silakan coba beberapa saat lagi.",
    };
  }

  let payload: GitHubGraphQLResponse | null = null;

  try {
    payload = (await response.json()) as GitHubGraphQLResponse;
  } catch {
    payload = null;
  }

  if (
    isRateLimitError(
      response.status,
      response.headers,
      payload?.message,
      payload?.errors,
    )
  ) {
    return {
      ok: false,
      userMessage:
        "⏳ Batas permintaan (rate limit) GitHub API sedang tercapai. Silakan coba beberapa saat lagi.",
    };
  }

  if (!response.ok) {
    const safeDetail = payload?.message
      ? redactToken(payload.message, token)
      : response.statusText;
    console.error(
      `GitHub API mengembalikan HTTP ${response.status}: ${safeDetail}`,
    );

    return {
      ok: false,
      userMessage: "❌ Gagal mengambil data dari GitHub API.",
    };
  }

  if (!payload || typeof payload !== "object") {
    console.error("Respons GitHub GraphQL API tidak valid (bukan objek JSON).");
    return {
      ok: false,
      userMessage: "❌ Gagal memproses respons dari GitHub API.",
    };
  }

  const errors = Array.isArray(payload.errors) ? payload.errors : [];

  if (errors.some((err) => err.type === "NOT_FOUND")) {
    return {
      ok: false,
      userMessage: `❌ Pengguna GitHub **${username}** tidak ditemukan.`,
    };
  }

  if (errors.length > 0) {
    const errorSummary = errors
      .map((err) => err.type || err.message || "UNKNOWN_GRAPHQL_ERROR")
      .join(", ");
    console.error("GitHub GraphQL error:", redactToken(errorSummary, token));

    return {
      ok: false,
      userMessage: "❌ Terjadi kesalahan saat mengambil data dari GitHub API.",
    };
  }

  const user = payload.data?.user;

  if (!user) {
    return {
      ok: false,
      userMessage: `❌ Pengguna GitHub **${username}** tidak ditemukan.`,
    };
  }

  return {
    ok: true,
    year,
    profile: {
      login: user.login,
      name: user.name,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      url: user.url,
      publicRepos: user.repositories.totalCount,
      followers: user.followers.totalCount,
      following: user.following.totalCount,
      totalCommitContributions:
        user.contributionsCollection.totalCommitContributions,
    },
  };
}

export function buildGitHubEmbed(
  profile: GitHubUserProfile,
  year: number,
): EmbedBuilder {
  const displayName = profile.name?.trim() || "Tidak diatur";
  const bio = profile.bio?.trim() || "Tidak ada bio.";
  const title = profile.name?.trim()
    ? `🐙 ${profile.name.trim()} (${profile.login})`
    : `🐙 ${profile.login}`;

  return new EmbedBuilder()
    .setColor(0xffdecc)
    .setTitle(title)
    .setURL(profile.url)
    .setThumbnail(profile.avatarUrl)
    .setDescription(bio)
    .addFields(
      {
        name: "Nama",
        value: displayName,
        inline: true,
      },
      {
        name: "Username",
        value: profile.login,
        inline: true,
      },
      {
        name: "🔗 Profil",
        value: `[Lihat di GitHub](${profile.url})`,
        inline: true,
      },
      {
        name: "📦 Repositori Publik",
        value: profile.publicRepos.toLocaleString("id-ID"),
        inline: true,
      },
      {
        name: "👥 Followers",
        value: profile.followers.toLocaleString("id-ID"),
        inline: true,
      },
      {
        name: "👣 Following",
        value: profile.following.toLocaleString("id-ID"),
        inline: true,
      },
      {
        name: `💻 Kontribusi Commit (${year})`,
        value:
          `**${profile.totalCommitContributions.toLocaleString("id-ID")}** commit sejak 1 Jan ${year}\n` +
          "*Jumlah ini adalah kontribusi commit yang dilaporkan GitHub dan dapat berbeda dari seluruh commit yang pernah dibuat pengguna (tidak mencakup kontribusi privat yang tidak dapat diakses).*",
      },
    )
    .setFooter({ text: "Noko • PKH Community" })
    .setTimestamp();
}

export const data = new SlashCommandBuilder()
  .setName("github")
  .setDescription("Menampilkan profil publik dan kontribusi commit GitHub")
  .addStringOption((option) =>
    option
      .setName("username")
      .setDescription("Username GitHub yang ingin dilihat")
      .setMinLength(1)
      .setMaxLength(MAX_USERNAME_LENGTH)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const username = interaction.options.getString("username", true).trim();

  if (!isValidGitHubUsername(username)) {
    await interaction.reply({
      content: "❌ Format username GitHub tidak valid.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const githubToken = process.env.GITHUB_TOKEN?.trim();

  if (!githubToken) {
    console.error("GITHUB_TOKEN belum dikonfigurasi pada environment.");
    await interaction.reply({
      content: "❌ Konfigurasi GitHub belum tersedia pada bot.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  const result = await fetchGitHubProfile(username, githubToken);

  if (!result.ok) {
    await interaction.editReply({
      content: result.userMessage,
    });
    return;
  }

  await interaction.editReply({
    embeds: [buildGitHubEmbed(result.profile, result.year)],
  });
}
