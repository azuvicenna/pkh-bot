import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

const KAGGLE_WEB_BASE_URL = "https://www.kaggle.com";
const KAGGLE_PROFILE_API_ENDPOINT =
  "https://www.kaggle.com/api/i/users.ProfileService/GetProfile";
const KAGGLE_SEARCH_API_ENDPOINT =
  "https://api.kaggle.com/v1/search.SearchApiService/ListEntities";
const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_USERNAME_LENGTH = 40;

const KAGGLE_USERNAME_REGEX =
  /^[a-zA-Z\d](?:[a-zA-Z\d]|[-_](?=[a-zA-Z\d])){0,39}$/;

const RESERVED_KAGGLE_ROUTES = new Set([
  "account",
  "admin",
  "api",
  "benchmarks",
  "c",
  "code",
  "competitions",
  "contact",
  "cookies",
  "courses",
  "d",
  "datasets",
  "discussions",
  "docs",
  "general",
  "host",
  "k",
  "kernels",
  "learn",
  "m",
  "models",
  "notebooks",
  "oauth",
  "organizations",
  "privacy",
  "progression",
  "rankings",
  "search",
  "settings",
  "signin",
  "signup",
  "static",
  "terms",
  "users",
  "work",
]);

const RATE_LIMIT_PATTERN = /rate limit|too many requests|quota exceeded/i;

const NAMED_HTML_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  amp: "&",
};

const KAGGLE_TIER_LABELS: Record<string, string> = {
  NOVICE: "Novice",
  CONTRIBUTOR: "Contributor",
  EXPERT: "Expert",
  MASTER: "Master",
  GRANDMASTER: "Grandmaster",
  STAFF: "Kaggle Staff",
};

export interface KaggleBasicProfile {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  url: string;
}

export interface KaggleUserProfile extends KaggleBasicProfile {
  tier: string | null;
  location: string | null;
  organization: string | null;
  followers?: number | null;
  following?: number | null;
  totalDatasets?: number | null;
  competitionPoints: number | null;
  datasetPoints: number | null;
  kernelPoints: number | null;
  competitionRanking: number | null;
  datasetRanking: number | null;
  kernelRanking: number | null;
}

export interface KaggleSessionAuth {
  cookieHeader: string;
  xsrfToken: string;
}

interface KaggleProfileVisibilitySettings {
  hiddenSections?: unknown;
}

interface KaggleGetProfileResponse {
  userName?: unknown;
  displayName?: unknown;
  bio?: unknown;
  userAvatarUrl?: unknown;
  performanceTier?: unknown;
  totalGrandmasterLevel?: unknown;
  country?: unknown;
  region?: unknown;
  city?: unknown;
  organization?: unknown;
  totalUsersFollowingMe?: unknown;
  totalUsersIFollow?: unknown;
  totalDatasets?: unknown;
  locationSharingOptOut?: unknown;
  visibilitySettings?: KaggleProfileVisibilitySettings | null;
}

interface KaggleSearchOwnerUser {
  userName?: unknown;
  displayName?: unknown;
  thumbnailUrl?: unknown;
  tier?: unknown;
}

interface KaggleSearchUserDocument {
  grandmasterTierLevel?: unknown;
  userLocation?: unknown;
  occupationOrganizationName?: unknown;
  competitionRanking?: unknown;
  competitionPoints?: unknown;
  kernelRanking?: unknown;
  kernelPoints?: unknown;
  datasetRanking?: unknown;
  datasetPoints?: unknown;
}

interface KaggleSearchEntityDocument {
  documentType?: unknown;
  ownerUser?: KaggleSearchOwnerUser | null;
  userDocument?: KaggleSearchUserDocument | null;
}

interface KaggleListEntitiesResponse {
  documents?: unknown;
}

export type KaggleFetchResult =
  | {
      ok: true;
      profile: KaggleUserProfile;
    }
  | {
      ok: false;
      userMessage: string;
    };

export function isValidKaggleUsername(username: string): boolean {
  if (typeof username !== "string" || /\s/.test(username)) {
    return false;
  }

  if (!KAGGLE_USERNAME_REGEX.test(username)) {
    return false;
  }

  return !RESERVED_KAGGLE_ROUTES.has(username.toLowerCase());
}

export function decodeHtmlEntities(input: string): string {
  if (!input || !input.includes("&")) {
    return input.replace(/\r\n?/g, "\n");
  }

  const decoded = input
    .replace(/&#x([0-9a-fA-F]+);/g, (full, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      if (
        !Number.isFinite(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff
      ) {
        return full;
      }
      return String.fromCodePoint(codePoint);
    })
    .replace(/&#(\d+);/g, (full, dec: string) => {
      const codePoint = Number.parseInt(dec, 10);
      if (
        !Number.isFinite(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff
      ) {
        return full;
      }
      return String.fromCodePoint(codePoint);
    })
    .replace(/&(quot|apos|lt|gt|nbsp|amp);/gi, (full, name: string) => {
      const replacement = NAMED_HTML_ENTITIES[name.toLowerCase()];
      return replacement ?? full;
    });

  return decoded.replace(/\r\n?/g, "\n");
}

export function resolveKaggleAvatarUrl(
  rawAvatarUrl: string | null | undefined,
): string | null {
  if (typeof rawAvatarUrl !== "string") {
    return null;
  }

  const trimmed = decodeHtmlEntities(rawAvatarUrl).trim();

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
    const parsed = new URL(trimmed, KAGGLE_WEB_BASE_URL);

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

function extractMetaTags(html: string): Map<string, string> {
  const metaMap = new Map<string, string>();
  const metaTagRegex = /<meta\b[^>]*>/gi;
  const attrRegex =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  for (const tagMatch of html.matchAll(metaTagRegex)) {
    const tag = tagMatch[0];
    const attrs = new Map<string, string>();

    for (const attrMatch of tag.matchAll(attrRegex)) {
      const attrName = attrMatch[1]?.toLowerCase();
      const rawValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
      if (attrName) {
        attrs.set(attrName, decodeHtmlEntities(rawValue));
      }
    }

    const key = (attrs.get("property") ?? attrs.get("name"))
      ?.trim()
      .toLowerCase();
    const content = attrs.get("content");

    if (key && typeof content === "string" && !metaMap.has(key)) {
      metaMap.set(key, content);
    }
  }

  return metaMap;
}

function isDefaultKaggleBioPlaceholder(
  bio: string,
  displayName: string | null,
  username: string,
): boolean {
  const normalizedBio = bio.trim().toLowerCase();

  if (!normalizedBio) {
    return true;
  }

  if (
    displayName &&
    normalizedBio === `kaggle profile for ${displayName.trim().toLowerCase()}`
  ) {
    return true;
  }

  return normalizedBio === `kaggle profile for ${username.trim().toLowerCase()}`;
}

export function parseKaggleProfileHtml(
  html: string,
  expectedUsername?: string,
): KaggleBasicProfile | null {
  if (typeof html !== "string" || !html.trim()) {
    return null;
  }

  const metaMap = extractMetaTags(html);
  const ogType = metaMap.get("og:type")?.trim().toLowerCase();
  const ogUsername = metaMap.get("og:username")?.trim() ?? "";

  if (ogType !== "profile" || !ogUsername) {
    return null;
  }

  if (!isValidKaggleUsername(ogUsername)) {
    return null;
  }

  if (
    expectedUsername &&
    ogUsername.toLowerCase() !== expectedUsername.trim().toLowerCase()
  ) {
    return null;
  }

  const rawTitle = metaMap.get("og:title")?.trim() ?? "";
  const displayName = rawTitle || null;

  const rawDescription = metaMap.get("og:description")?.trim() ?? "";
  const bio =
    rawDescription &&
    !isDefaultKaggleBioPlaceholder(rawDescription, displayName, ogUsername)
      ? rawDescription
      : null;

  const rawAvatar =
    metaMap.get("twitter:image") ?? metaMap.get("og:image") ?? null;

  return {
    username: ogUsername,
    displayName,
    bio,
    avatarUrl: resolveKaggleAvatarUrl(rawAvatar),
    url: `${KAGGLE_WEB_BASE_URL}/${encodeURIComponent(ogUsername)}`,
  };
}

function parseStatCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function parseRankingCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
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

function formatKaggleTier(rawTier: unknown, gmLevel?: unknown): string | null {
  if (typeof rawTier !== "string") {
    return null;
  }

  const normalized = rawTier.trim().toUpperCase();
  const label = KAGGLE_TIER_LABELS[normalized];

  if (!label) {
    return null;
  }

  if (
    normalized === "GRANDMASTER" &&
    typeof gmLevel === "number" &&
    Number.isFinite(gmLevel) &&
    gmLevel >= 2
  ) {
    return `${label} (${gmLevel}x)`;
  }

  return label;
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

export function extractKaggleSessionAuth(
  headers: Headers,
): KaggleSessionAuth | null {
  const rawSetCookies =
    typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const fallbackHeader = headers.get("set-cookie");
  const cookieEntries =
    rawSetCookies.length > 0
      ? rawSetCookies
      : fallbackHeader
        ? fallbackHeader.split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
        : [];

  const cookieMap = new Map<string, string>();
  for (const entry of cookieEntries) {
    const firstSegment = entry.split(";")[0]?.trim() ?? "";
    const eqIndex = firstSegment.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }
    const name = firstSegment.slice(0, eqIndex).trim();
    const value = firstSegment.slice(eqIndex + 1).trim();
    if (name && value) {
      cookieMap.set(name, value);
    }
  }

  const xsrfToken = cookieMap.get("XSRF-TOKEN") ?? "";
  if (!xsrfToken || cookieMap.size === 0) {
    return null;
  }

  const cookieHeader = Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  return {
    cookieHeader,
    xsrfToken,
  };
}

function parseProtobufZeroDefaultCount(
  value: unknown,
  isHidden = false,
): number | null {
  if (isHidden) {
    return null;
  }

  if (value === undefined) {
    return 0;
  }

  return parseStatCount(value);
}

function formatKaggleProfileLocation(
  payload: KaggleGetProfileResponse,
): string | null {
  if (payload.locationSharingOptOut === true) {
    return null;
  }

  const parts = [payload.city, payload.region, payload.country]
    .filter((part): part is string => typeof part === "string")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

async function fetchKaggleProfileDetails(
  username: string,
  sessionAuth: KaggleSessionAuth | null,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<Partial<KaggleUserProfile> | null> {
  try {
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Noko-PKH-Bot",
    };

    if (sessionAuth) {
      requestHeaders.Cookie = sessionAuth.cookieHeader;
      requestHeaders["X-XSRF-TOKEN"] = sessionAuth.xsrfToken;
    }

    const response = await fetchFn(KAGGLE_PROFILE_API_ENDPOINT, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({ userName: username }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as KaggleGetProfileResponse;
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const returnedUsername =
      typeof payload.userName === "string"
        ? payload.userName.trim().toLowerCase()
        : "";
    if (!returnedUsername || returnedUsername !== username.toLowerCase()) {
      return null;
    }

    const hiddenSections = new Set<string>(
      Array.isArray(payload.visibilitySettings?.hiddenSections)
        ? payload.visibilitySettings.hiddenSections
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim().toUpperCase())
        : [],
    );

    const isFollowersHidden =
      hiddenSections.has("PROFILE_SECTION_FOLLOWERS") ||
      hiddenSections.has("FOLLOWERS");
    const isFollowingHidden =
      hiddenSections.has("PROFILE_SECTION_FOLLOWING") ||
      hiddenSections.has("FOLLOWING");
    const isBioHidden =
      hiddenSections.has("PROFILE_SECTION_BIO") || hiddenSections.has("BIO");

    const displayName =
      typeof payload.displayName === "string" && payload.displayName.trim()
        ? payload.displayName.trim()
        : null;
    const bio =
      !isBioHidden && typeof payload.bio === "string" && payload.bio.trim()
        ? payload.bio.trim()
        : null;
    const avatarUrl = resolveKaggleAvatarUrl(
      typeof payload.userAvatarUrl === "string" ? payload.userAvatarUrl : null,
    );
    const tier = formatKaggleTier(
      payload.performanceTier,
      payload.totalGrandmasterLevel,
    );
    const location = formatKaggleProfileLocation(payload);
    const organization =
      typeof payload.organization === "string" && payload.organization.trim()
        ? payload.organization.trim()
        : null;

    return {
      displayName,
      bio,
      avatarUrl,
      tier,
      location,
      organization,
      followers: parseProtobufZeroDefaultCount(
        payload.totalUsersFollowingMe,
        isFollowersHidden,
      ),
      following: parseProtobufZeroDefaultCount(
        payload.totalUsersIFollow,
        isFollowingHidden,
      ),
      totalDatasets: parseProtobufZeroDefaultCount(payload.totalDatasets),
    };
  } catch {
    return null;
  }
}

async function fetchKaggleEnrichment(
  username: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<Partial<KaggleUserProfile> | null> {
  try {
    const response = await fetchFn(KAGGLE_SEARCH_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Noko-PKH-Bot",
      },
      body: JSON.stringify({
        filters: {
          query: username,
          documentTypes: ["USER"],
        },
        usersOrderBy: "SEARCH_USERS_ORDER_BY_TIER_AND_LEVEL",
        pageSize: 20,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as KaggleListEntitiesResponse;
    if (
      !payload ||
      typeof payload !== "object" ||
      !Array.isArray(payload.documents)
    ) {
      return null;
    }

    const targetLower = username.toLowerCase();
    const matchedDoc = (
      payload.documents as KaggleSearchEntityDocument[]
    ).find((doc) => {
      if (!doc || typeof doc !== "object") {
        return false;
      }
      if (doc.documentType !== undefined && doc.documentType !== "USER") {
        return false;
      }
      const candidateName =
        typeof doc.ownerUser?.userName === "string"
          ? doc.ownerUser.userName.trim().toLowerCase()
          : "";
      return candidateName === targetLower;
    });

    if (!matchedDoc) {
      return null;
    }

    const ownerUser = matchedDoc.ownerUser ?? {};
    const userDoc = matchedDoc.userDocument ?? {};

    const displayName =
      typeof ownerUser.displayName === "string" && ownerUser.displayName.trim()
        ? ownerUser.displayName.trim()
        : null;
    const avatarUrl = resolveKaggleAvatarUrl(
      typeof ownerUser.thumbnailUrl === "string"
        ? ownerUser.thumbnailUrl
        : null,
    );
    const tier = formatKaggleTier(
      ownerUser.tier,
      userDoc.grandmasterTierLevel,
    );
    const location =
      typeof userDoc.userLocation === "string" && userDoc.userLocation.trim()
        ? userDoc.userLocation.trim()
        : null;
    const organization =
      typeof userDoc.occupationOrganizationName === "string" &&
      userDoc.occupationOrganizationName.trim()
        ? userDoc.occupationOrganizationName.trim()
        : null;

    return {
      displayName,
      avatarUrl,
      tier,
      location,
      organization,
      competitionPoints: parseStatCount(userDoc.competitionPoints),
      datasetPoints: parseStatCount(userDoc.datasetPoints),
      kernelPoints: parseStatCount(userDoc.kernelPoints),
      competitionRanking: parseRankingCount(userDoc.competitionRanking),
      datasetRanking: parseRankingCount(userDoc.datasetRanking),
      kernelRanking: parseRankingCount(userDoc.kernelRanking),
    };
  } catch {
    return null;
  }
}

export async function fetchKaggleProfile(
  username: string,
  options?: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<KaggleFetchResult> {
  const normalizedUsername = username.trim();

  if (!isValidKaggleUsername(normalizedUsername)) {
    return {
      ok: false,
      userMessage: "❌ Format username Kaggle tidak valid.",
    };
  }

  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const fetchFn = options?.fetchImpl ?? fetch;
  const profilePageUrl = `${KAGGLE_WEB_BASE_URL}/${encodeURIComponent(normalizedUsername)}`;

  let response: Response;

  try {
    response = await fetchFn(profilePageUrl, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
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
          "❌ Permintaan ke Kaggle melewati batas waktu (timeout). Silakan coba lagi.",
      };
    }

    const safeMessage =
      error instanceof Error ? error.message : "Unknown network error";
    console.error("Gagal menghubungi Kaggle:", safeMessage);

    return {
      ok: false,
      userMessage:
        "❌ Gagal terhubung ke Kaggle. Silakan coba beberapa saat lagi.",
    };
  }

  let html = "";
  try {
    html = await response.text();
  } catch {
    html = "";
  }

  if (isRateLimitError(response.status, response.headers, html)) {
    return {
      ok: false,
      userMessage:
        "⏳ Batas permintaan (rate limit) Kaggle sedang tercapai. Silakan coba beberapa saat lagi.",
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      userMessage: `❌ Pengguna Kaggle **${normalizedUsername}** tidak ditemukan.`,
    };
  }

  if (!response.ok) {
    console.error(
      `Kaggle mengembalikan HTTP ${response.status}: ${response.statusText || "HTTP Error"}`,
    );

    return {
      ok: false,
      userMessage: "❌ Gagal mengambil data dari Kaggle.",
    };
  }

  const basicProfile = parseKaggleProfileHtml(html, normalizedUsername);

  if (!basicProfile) {
    console.error(
      `Respons halaman Kaggle untuk "${normalizedUsername}" tidak memiliki metadata profil yang valid.`,
    );
    return {
      ok: false,
      userMessage: `❌ Pengguna Kaggle **${normalizedUsername}** tidak ditemukan atau respons tidak valid.`,
    };
  }

  const sessionAuth = extractKaggleSessionAuth(response.headers);
  const [profileDetails, enrichment] = await Promise.all([
    fetchKaggleProfileDetails(
      basicProfile.username,
      sessionAuth,
      timeoutMs,
      fetchFn,
    ),
    fetchKaggleEnrichment(basicProfile.username, timeoutMs, fetchFn),
  ]);

  return {
    ok: true,
    profile: {
      username: basicProfile.username,
      displayName:
        basicProfile.displayName ??
        profileDetails?.displayName ??
        enrichment?.displayName ??
        null,
      bio: basicProfile.bio ?? profileDetails?.bio ?? null,
      avatarUrl:
        basicProfile.avatarUrl ??
        profileDetails?.avatarUrl ??
        enrichment?.avatarUrl ??
        null,
      url: basicProfile.url,
      tier: profileDetails?.tier ?? enrichment?.tier ?? null,
      location: profileDetails?.location ?? enrichment?.location ?? null,
      organization:
        profileDetails?.organization ?? enrichment?.organization ?? null,
      followers: profileDetails?.followers ?? null,
      following: profileDetails?.following ?? null,
      totalDatasets: profileDetails?.totalDatasets ?? null,
      competitionPoints: enrichment?.competitionPoints ?? null,
      datasetPoints: enrichment?.datasetPoints ?? null,
      kernelPoints: enrichment?.kernelPoints ?? null,
      competitionRanking: enrichment?.competitionRanking ?? null,
      datasetRanking: enrichment?.datasetRanking ?? null,
      kernelRanking: enrichment?.kernelRanking ?? null,
    },
  };
}

function resolveKaggleProfileUrl(
  username: string,
  candidateUrl?: string | null,
): string {
  const safeFallback = `${KAGGLE_WEB_BASE_URL}/${encodeURIComponent(username.trim())}`;
  if (typeof candidateUrl !== "string" || !candidateUrl.trim()) {
    return safeFallback;
  }

  try {
    const parsed = new URL(candidateUrl.trim());
    if (
      parsed.protocol === "https:" &&
      parsed.hostname === "www.kaggle.com" &&
      parsed.pathname === `/${encodeURIComponent(username.trim())}` &&
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

export function buildKaggleEmbed(profile: KaggleUserProfile): EmbedBuilder {
  const trimmedName = profile.displayName?.trim() || "";
  const displayName = trimmedName || "Tidak diatur";
  const bio = profile.bio?.trim() || "Tidak ada bio.";
  const title = trimmedName
    ? `📊 ${trimmedName} (${profile.username})`
    : `📊 ${profile.username}`;
  const profileUrl = resolveKaggleProfileUrl(profile.username, profile.url);
  const thumbnailUrl = resolveKaggleAvatarUrl(profile.avatarUrl);

  const embed = new EmbedBuilder()
    .setColor(0xffdecc)
    .setTitle(title)
    .setURL(profileUrl)
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
        value: `[Lihat di Kaggle](${profileUrl})`,
        inline: true,
      },
      {
        name: "🏅 Tier",
        value: profile.tier?.trim() || "Tidak tersedia",
        inline: true,
      },
      {
        name: "📍 Lokasi",
        value: profile.location?.trim() || "Tidak tersedia",
        inline: true,
      },
      {
        name: "🏢 Organisasi",
        value: profile.organization?.trim() || "Tidak tersedia",
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
        name: "📦 Dataset Publik",
        value: formatStatCount(profile.totalDatasets),
        inline: true,
      },
      {
        name: "🏆 Poin Kompetisi",
        value: formatStatCount(profile.competitionPoints),
        inline: true,
      },
      {
        name: "📊 Poin Dataset",
        value: formatStatCount(profile.datasetPoints),
        inline: true,
      },
      {
        name: "💻 Poin Notebook",
        value: formatStatCount(profile.kernelPoints),
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
  .setName("kaggle")
  .setDescription("Menampilkan profil publik pengguna Kaggle")
  .addStringOption((option) =>
    option
      .setName("username")
      .setDescription("Username Kaggle yang ingin dilihat")
      .setMinLength(1)
      .setMaxLength(MAX_USERNAME_LENGTH)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const username = interaction.options.getString("username", true).trim();

  if (!isValidKaggleUsername(username)) {
    await interaction.reply({
      content: "❌ Format username Kaggle tidak valid.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const result = await fetchKaggleProfile(username);

    if (!result.ok) {
      await interaction.editReply({
        content: result.userMessage,
        allowedMentions: { parse: [] },
      });
      return;
    }

    await interaction.editReply({
      embeds: [buildKaggleEmbed(result.profile)],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    const safeError =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Gagal menjalankan command /kaggle:", safeError);

    await interaction
      .editReply({
        content: "❌ Terjadi kesalahan saat mengambil profil Kaggle.",
        allowedMentions: { parse: [] },
      })
      .catch((editError) => {
        console.error("Gagal mengirim respons error /kaggle:", editError);
      });
  }
}
