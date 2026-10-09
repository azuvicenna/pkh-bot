import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

const DOCKERHUB_WEB_BASE_URL = "https://hub.docker.com";
const DOCKERHUB_API_BASE_URL = "https://hub.docker.com/v2";
const REQUEST_TIMEOUT_MS = 10_000;
const REPOSITORIES_PAGE_SIZE = 25;
const MAX_REPO_DESCRIPTION_LENGTH = 80;
const DISCORD_FIELD_VALUE_LIMIT = 1024;

export const MAX_USERNAME_LENGTH = 30;
export const MAX_DISPLAYED_REPOS = 5;

const DOCKERHUB_USERNAME_REGEX =
  /^[a-z\d](?:[a-z\d]|[-_.](?=[a-z\d])){0,29}$/;

const RESERVED_DOCKERHUB_ROUTES = new Set(["login", "2fa-login", "signup"]);

const RATE_LIMIT_PATTERN =
  /rate limit|too many requests|quota exceeded|toomanyrequests/i;

const DOCKERHUB_BADGE_LABELS: Record<string, string> = {
  verified_publisher: "Verified Publisher",
  open_source: "Sponsored OSS",
  official: "Official Image",
};

export interface DockerHubRepository {
  name: string;
  namespace: string;
  description: string | null;
  pullCount: number;
  starCount: number;
  lastUpdated: string | null;
  url: string;
}

export interface DockerHubUserProfile {
  username: string;
  fullName: string | null;
  accountType: "User" | "Organization";
  badge: string | null;
  location: string | null;
  company: string | null;
  dateJoined: string | null;
  avatarUrl: string | null;
  websiteUrl: string | null;
  url: string;
  publicRepos: number | null;
  repositories: DockerHubRepository[] | null;
}

interface DockerHubUserApiResponse {
  id?: unknown;
  uuid?: unknown;
  username?: unknown;
  orgname?: unknown;
  full_name?: unknown;
  location?: unknown;
  company?: unknown;
  profile_url?: unknown;
  date_joined?: unknown;
  gravatar_url?: unknown;
  type?: unknown;
  badge?: unknown;
  message?: unknown;
  detail?: unknown;
}

interface DockerHubRepositoryApiEntry {
  name?: unknown;
  namespace?: unknown;
  description?: unknown;
  is_private?: unknown;
  star_count?: unknown;
  pull_count?: unknown;
  last_updated?: unknown;
}

interface DockerHubRepositoriesApiResponse {
  count?: unknown;
  results?: unknown;
  message?: unknown;
  detail?: unknown;
}

export type DockerHubFetchResult =
  | {
      ok: true;
      profile: DockerHubUserProfile;
    }
  | {
      ok: false;
      userMessage: string;
    };

export function normalizeDockerHubUsername(username: string): string {
  if (typeof username !== "string") {
    return "";
  }

  return username.trim().toLowerCase();
}

export function isValidDockerHubUsername(username: string): boolean {
  if (typeof username !== "string") {
    return false;
  }

  const trimmed = username.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }

  const normalized = trimmed.toLowerCase();
  if (RESERVED_DOCKERHUB_ROUTES.has(normalized)) {
    return false;
  }

  return DOCKERHUB_USERNAME_REGEX.test(normalized);
}

export function resolveDockerHubAvatarUrl(
  rawAvatarUrl: string | null | undefined,
): string | null {
  if (typeof rawAvatarUrl !== "string") {
    return null;
  }

  const trimmed = rawAvatarUrl.replace(/&amp;/gi, "&").trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return null;
  }

  const isAbsoluteHttps = trimmed.startsWith("https://");
  const isRootRelative =
    trimmed.startsWith("/") && !trimmed.startsWith("//");

  if (!isAbsoluteHttps && !isRootRelative) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, DOCKERHUB_WEB_BASE_URL);
    if (parsed.protocol !== "https:") {
      return null;
    }

    const hostname = parsed.hostname;
    if (
      !hostname ||
      !hostname.includes(".") ||
      hostname.startsWith(".") ||
      hostname.endsWith(".")
    ) {
      return null;
    }

    const lowerPathname = parsed.pathname.toLowerCase();
    if (
      lowerPathname.endsWith(".svg") ||
      lowerPathname.includes("http:") ||
      lowerPathname.includes("https:")
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function buildDockerHubProfileUrl(username: string): string {
  const normalized = normalizeDockerHubUsername(username);
  return `${DOCKERHUB_WEB_BASE_URL}/u/${encodeURIComponent(normalized)}`;
}

function buildDockerHubRepositoryUrl(
  namespace: string,
  repoName: string,
): string {
  const normalizedNamespace = normalizeDockerHubUsername(namespace);
  const cleanRepo = repoName.trim();
  if (normalizedNamespace === "library") {
    return `${DOCKERHUB_WEB_BASE_URL}/_/${encodeURIComponent(cleanRepo)}`;
  }

  return `${DOCKERHUB_WEB_BASE_URL}/r/${encodeURIComponent(normalizedNamespace)}/${encodeURIComponent(cleanRepo)}`;
}

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

function formatStatCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "Tidak tersedia";
  }

  return value.toLocaleString("id-ID");
}

function formatDockerHubBadge(rawBadge: unknown): string | null {
  if (typeof rawBadge !== "string" || !rawBadge.trim()) {
    return null;
  }

  const normalized = rawBadge.trim().toLowerCase();
  return DOCKERHUB_BADGE_LABELS[normalized] ?? null;
}

function formatDateJoined(rawDate: string | null | undefined): string {
  if (typeof rawDate !== "string" || !rawDate.trim()) {
    return "Tidak tersedia";
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Tidak tersedia";
  }

  return parsed.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function sanitizeInlineText(text: string, maxLength: number): string {
  const collapsed = text
    .replace(/\s+/g, " ")
    .replace(/[*_`~[\]()<>]/g, "")
    .trim();

  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
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
    const remaining =
      headers.get("x-ratelimit-remaining") ?? headers.get("ratelimit-remaining");
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

export function parseDockerHubProfilePayload(
  payload: unknown,
  expectedUsername?: string,
): Omit<DockerHubUserProfile, "publicRepos" | "repositories"> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as DockerHubUserApiResponse;
  const rawUsername =
    typeof data.username === "string" && data.username.trim()
      ? data.username.trim()
      : typeof data.orgname === "string" && data.orgname.trim()
        ? data.orgname.trim()
        : "";

  const normalizedUsername = normalizeDockerHubUsername(rawUsername);
  if (!normalizedUsername || !isValidDockerHubUsername(normalizedUsername)) {
    return null;
  }

  if (
    expectedUsername &&
    normalizedUsername !== normalizeDockerHubUsername(expectedUsername)
  ) {
    return null;
  }

  const rawType =
    typeof data.type === "string" ? data.type.trim().toLowerCase() : "";
  const isOrg =
    rawType === "organization" ||
    (typeof data.orgname === "string" && data.orgname.trim().length > 0);
  const accountType: "User" | "Organization" = isOrg ? "Organization" : "User";

  const fullName =
    typeof data.full_name === "string" && data.full_name.trim()
      ? data.full_name.trim()
      : null;
  const location =
    typeof data.location === "string" && data.location.trim()
      ? data.location.trim()
      : null;
  const company =
    typeof data.company === "string" && data.company.trim()
      ? data.company.trim()
      : null;
  const dateJoined =
    typeof data.date_joined === "string" && data.date_joined.trim()
      ? data.date_joined.trim()
      : null;
  const websiteUrl =
    typeof data.profile_url === "string" && data.profile_url.trim()
      ? data.profile_url.trim()
      : null;
  const avatarUrl = resolveDockerHubAvatarUrl(
    typeof data.gravatar_url === "string" ? data.gravatar_url : null,
  );
  const badge = formatDockerHubBadge(data.badge);

  return {
    username: normalizedUsername,
    fullName,
    accountType,
    badge,
    location,
    company,
    dateJoined,
    avatarUrl,
    websiteUrl,
    url: buildDockerHubProfileUrl(normalizedUsername),
  };
}

export function sortAndLimitRepositories(
  entries: unknown[],
  fallbackNamespace: string,
  limit = MAX_DISPLAYED_REPOS,
): DockerHubRepository[] {
  const normalizedFallback = normalizeDockerHubUsername(fallbackNamespace);
  const parsedRepos: DockerHubRepository[] = [];

  for (const item of entries) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const raw = item as DockerHubRepositoryApiEntry;
    if (raw.is_private === true) {
      continue;
    }

    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) {
      continue;
    }

    const namespace =
      typeof raw.namespace === "string" && raw.namespace.trim()
        ? normalizeDockerHubUsername(raw.namespace)
        : normalizedFallback;

    const pullCount = parseNonNegativeInt(raw.pull_count) ?? 0;
    const starCount = parseNonNegativeInt(raw.star_count) ?? 0;
    const description =
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : null;
    const lastUpdated =
      typeof raw.last_updated === "string" && raw.last_updated.trim()
        ? raw.last_updated.trim()
        : null;

    parsedRepos.push({
      name,
      namespace,
      description,
      pullCount,
      starCount,
      lastUpdated,
      url: buildDockerHubRepositoryUrl(namespace, name),
    });
  }

  parsedRepos.sort((a, b) => {
    if (b.pullCount !== a.pullCount) {
      return b.pullCount - a.pullCount;
    }
    if (b.starCount !== a.starCount) {
      return b.starCount - a.starCount;
    }
    return a.name.localeCompare(b.name);
  });

  return parsedRepos.slice(0, Math.max(0, limit));
}

async function fetchDockerHubRepositories(
  namespace: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<{
  publicRepos: number;
  repositories: DockerHubRepository[];
} | null> {
  const endpoint = `${DOCKERHUB_API_BASE_URL}/namespaces/${encodeURIComponent(namespace)}/repositories?page=1&page_size=${REPOSITORIES_PAGE_SIZE}&ordering=pull_count`;

  try {
    const response = await fetchFn(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Noko-PKH-Bot",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as DockerHubRepositoriesApiResponse;
    if (
      !payload ||
      typeof payload !== "object" ||
      !Array.isArray(payload.results)
    ) {
      return null;
    }

    const totalCount = parseNonNegativeInt(payload.count);
    if (totalCount === null) {
      return null;
    }

    const repositories = sortAndLimitRepositories(
      payload.results,
      namespace,
      MAX_DISPLAYED_REPOS,
    );

    return {
      publicRepos: totalCount,
      repositories,
    };
  } catch {
    return null;
  }
}

export async function fetchDockerHubProfile(
  username: string,
  options?: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<DockerHubFetchResult> {
  if (!isValidDockerHubUsername(username)) {
    return {
      ok: false,
      userMessage: "❌ Format username Docker Hub tidak valid.",
    };
  }

  const normalizedUsername = normalizeDockerHubUsername(username);
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const fetchFn = options?.fetchImpl ?? fetch;
  const userEndpoint = `${DOCKERHUB_API_BASE_URL}/users/${encodeURIComponent(normalizedUsername)}/`;

  let response: Response;

  try {
    response = await fetchFn(userEndpoint, {
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
          "❌ Permintaan ke Docker Hub melewati batas waktu (timeout). Silakan coba lagi.",
      };
    }

    const safeMessage =
      error instanceof Error ? error.message : "Unknown network error";
    console.error("Gagal menghubungi Docker Hub API:", safeMessage);

    return {
      ok: false,
      userMessage:
        "❌ Gagal terhubung ke Docker Hub API. Silakan coba beberapa saat lagi.",
    };
  }

  let payload: DockerHubUserApiResponse | null = null;
  let rawText = "";

  try {
    rawText = await response.text();
    payload = rawText ? (JSON.parse(rawText) as DockerHubUserApiResponse) : null;
  } catch {
    payload = null;
  }

  const errorMessageText =
    typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.detail === "string"
        ? payload.detail
        : rawText;

  if (isRateLimitError(response.status, response.headers, errorMessageText)) {
    return {
      ok: false,
      userMessage:
        "⏳ Batas permintaan (rate limit) Docker Hub sedang tercapai. Silakan coba beberapa saat lagi.",
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      userMessage: `❌ Pengguna atau organisasi Docker Hub **${normalizedUsername}** tidak ditemukan.`,
    };
  }

  if (!response.ok) {
    console.error(
      `Docker Hub API mengembalikan HTTP ${response.status}: ${response.statusText || "HTTP Error"}`,
    );

    return {
      ok: false,
      userMessage: "❌ Gagal mengambil data dari Docker Hub API.",
    };
  }

  const baseProfile = parseDockerHubProfilePayload(payload, normalizedUsername);
  if (!baseProfile) {
    console.error(
      `Respons Docker Hub API untuk "${normalizedUsername}" tidak valid.`,
    );
    return {
      ok: false,
      userMessage: "❌ Gagal memproses respons dari Docker Hub API.",
    };
  }

  const repoData = await fetchDockerHubRepositories(
    baseProfile.username,
    timeoutMs,
    fetchFn,
  );

  return {
    ok: true,
    profile: {
      ...baseProfile,
      publicRepos: repoData ? repoData.publicRepos : null,
      repositories: repoData ? repoData.repositories : null,
    },
  };
}

function resolveDockerHubProfileUrl(
  username: string,
  candidateUrl?: string | null,
): string {
  const safeFallback = buildDockerHubProfileUrl(username);
  if (typeof candidateUrl !== "string" || !candidateUrl.trim()) {
    return safeFallback;
  }

  try {
    const parsed = new URL(candidateUrl.trim());
    const normalized = normalizeDockerHubUsername(username);
    if (
      parsed.protocol === "https:" &&
      parsed.hostname === "hub.docker.com" &&
      parsed.pathname === `/u/${encodeURIComponent(normalized)}` &&
      !parsed.search &&
      !parsed.hash
    ) {
      return parsed.toString();
    }
  } catch {
    // Gunakan fallback kanonis di bawah
  }

  return safeFallback;
}

function formatRepositoriesFieldValue(
  profile: DockerHubUserProfile,
  profileUrl: string,
): string {
  if (profile.repositories === null || profile.publicRepos === null) {
    return "Daftar repositori tidak tersedia saat ini.";
  }

  if (profile.publicRepos === 0 || profile.repositories.length === 0) {
    return "Belum ada repositori image publik.";
  }

  const displayedRepos = profile.repositories.slice(0, MAX_DISPLAYED_REPOS);
  const lines: string[] = [];

  for (const repo of displayedRepos) {
    const repoPath = `${repo.namespace}/${repo.name}`;
    const repoUrl = buildDockerHubRepositoryUrl(repo.namespace, repo.name);
    const pulls = repo.pullCount.toLocaleString("id-ID");
    const stars = repo.starCount.toLocaleString("id-ID");

    let entry = `• [**${sanitizeInlineText(repoPath, 60)}**](${repoUrl}) — ⬇️ ${pulls} • ⭐ ${stars}`;

    if (repo.description && repo.description.trim()) {
      const shortDesc = sanitizeInlineText(
        repo.description,
        MAX_REPO_DESCRIPTION_LENGTH,
      );
      if (shortDesc) {
        entry += `\n  *${shortDesc}*`;
      }
    }

    lines.push(entry);
  }

  const footerLink = `\n*[Lihat seluruh repositori di Docker Hub](${profileUrl})*`;
  const combined = `${lines.join("\n")}${footerLink}`;

  if (combined.length <= DISCORD_FIELD_VALUE_LIMIT) {
    return combined;
  }

  return combined.slice(0, DISCORD_FIELD_VALUE_LIMIT - 1).trimEnd() + "…";
}

export function buildDockerHubEmbed(
  profile: DockerHubUserProfile,
): EmbedBuilder {
  const trimmedName = profile.fullName?.trim() || "";
  const displayName = trimmedName || "Tidak diatur";
  const profileUrl = resolveDockerHubProfileUrl(profile.username, profile.url);
  const thumbnailUrl = resolveDockerHubAvatarUrl(profile.avatarUrl);

  const title = trimmedName
    ? `🐳 ${trimmedName} (${profile.username})`
    : `🐳 ${profile.username}`;

  const accountTypeLabel =
    profile.accountType === "Organization" ? "Organization" : "User";
  const typeValue = profile.badge
    ? `${accountTypeLabel} (${profile.badge})`
    : accountTypeLabel;

  const descriptionParts: string[] = [];
  if (profile.company?.trim()) {
    descriptionParts.push(`🏢 ${profile.company.trim()}`);
  }
  if (profile.location?.trim()) {
    descriptionParts.push(`📍 ${profile.location.trim()}`);
  }
  const description =
    descriptionParts.length > 0
      ? descriptionParts.join(" • ")
      : "Profil publik Docker Hub.";

  const embed = new EmbedBuilder()
    .setColor(0xffdecc)
    .setTitle(title)
    .setURL(profileUrl)
    .setDescription(description)
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
        name: "🏷️ Tipe Akun",
        value: typeValue,
        inline: true,
      },
      {
        name: "📦 Repositori Publik",
        value: formatStatCount(profile.publicRepos),
        inline: true,
      },
      {
        name: "📍 Lokasi",
        value: profile.location?.trim() || "Tidak tersedia",
        inline: true,
      },
      {
        name: "🏢 Perusahaan",
        value: profile.company?.trim() || "Tidak tersedia",
        inline: true,
      },
      {
        name: "📅 Bergabung",
        value: formatDateJoined(profile.dateJoined),
        inline: true,
      },
      {
        name: "🔗 Profil",
        value: `[Lihat di Docker Hub](${profileUrl})`,
        inline: true,
      },
      {
        name: `📚 Repositori Publik Terpopuler (Maks. ${MAX_DISPLAYED_REPOS})`,
        value: formatRepositoriesFieldValue(profile, profileUrl),
        inline: false,
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
  .setName("dockerhub")
  .setDescription("Menampilkan profil dan repositori publik pengguna Docker Hub")
  .addStringOption((option) =>
    option
      .setName("username")
      .setDescription("Username atau organisasi Docker Hub yang ingin dilihat")
      .setMinLength(1)
      .setMaxLength(MAX_USERNAME_LENGTH)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const rawUsername = interaction.options.getString("username", true);
  const username = normalizeDockerHubUsername(rawUsername);

  if (!isValidDockerHubUsername(rawUsername)) {
    await interaction.reply({
      content: "❌ Format username Docker Hub tidak valid.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const result = await fetchDockerHubProfile(username);

    if (!result.ok) {
      await interaction.editReply({
        content: result.userMessage,
        allowedMentions: { parse: [] },
      });
      return;
    }

    await interaction.editReply({
      embeds: [buildDockerHubEmbed(result.profile)],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    const safeError =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Gagal menjalankan command /dockerhub:", safeError);

    await interaction
      .editReply({
        content: "❌ Terjadi kesalahan saat mengambil profil Docker Hub.",
        allowedMentions: { parse: [] },
      })
      .catch((editError) => {
        console.error("Gagal mengirim respons error /dockerhub:", editError);
      });
  }
}
