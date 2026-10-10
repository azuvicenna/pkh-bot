import {
  ChatInputCommandInteraction,
  Client,
  DiscordAPIError,
  GuildMember,
  Message,
  MessageFlags,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
} from "discord.js";
import { sendModLog } from "./mod-log";

export interface AntiSpamConfig {
  // Message Flooding
  messageMaxCount: number;
  messageWindowMs: number;

  // Duplicate Messages
  duplicateMaxCount: number;
  duplicateWindowMs: number;

  // Slash Command Rate Limiting
  commandCooldownMs: number;
  commandMaxBurst: number;
  commandWindowMs: number;

  // Command Specific Cooldowns (ms)
  commandSpecificCooldowns: Record<string, number>;

  // Command Spam Violation Threshold
  commandSpamThreshold: number;
  commandSpamWindowMs: number;

  // Escalation Timeouts (ms)
  escalationLevels: {
    level2TimeoutMs: number; // 1 minute
    level3TimeoutMs: number; // 10 minutes
    level4TimeoutMs: number; // 1 hour
  };

  // Violation Decay (ms)
  violationDecayMs: number; // 30 minutes

  // In-memory Cleanup Interval (ms)
  cleanupIntervalMs: number; // 5 minutes
}

export const DEFAULT_ANTI_SPAM_CONFIG: AntiSpamConfig = {
  messageMaxCount: 5,
  messageWindowMs: 5000,

  duplicateMaxCount: 3,
  duplicateWindowMs: 30000,

  commandCooldownMs: 2000,
  commandMaxBurst: 4,
  commandWindowMs: 6000,

  commandSpecificCooldowns: {
    daftar: 5000,
    ai: 5000,
    project: 5000,
    announce: 5000,
  },

  commandSpamThreshold: 4,
  commandSpamWindowMs: 15000,

  escalationLevels: {
    level2TimeoutMs: 60 * 1000, // 1 minute
    level3TimeoutMs: 10 * 60 * 1000, // 10 minutes
    level4TimeoutMs: 60 * 60 * 1000, // 1 hour
  },

  violationDecayMs: 30 * 60 * 1000, // 30 minutes
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
};

const MAX_DISCORD_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

export interface UserMessageRecord {
  timestamps: number[];
  duplicates: Array<{ content: string; timestamp: number }>;
}

export interface UserCommandRecord {
  commandTimestamps: Map<string, number>;
  allCommandTimestamps: number[];
  rateLimitHitTimestamps: number[];
}

export interface UserViolationRecord {
  level: number;
  lastViolationTime: number;
}

export interface EscalationResult {
  level: number;
  timeoutMs: number;
  durationText: string;
  isWarning: boolean;
}

export class AntiSpamService {
  private config: AntiSpamConfig;
  private messageRecords = new Map<string, UserMessageRecord>();
  private commandRecords = new Map<string, UserCommandRecord>();
  private violationRecords = new Map<string, UserViolationRecord>();
  private userLocks = new Set<string>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(customConfig?: Partial<AntiSpamConfig>) {
    this.config = {
      ...DEFAULT_ANTI_SPAM_CONFIG,
      ...customConfig,
      escalationLevels: {
        ...DEFAULT_ANTI_SPAM_CONFIG.escalationLevels,
        ...customConfig?.escalationLevels,
      },
      commandSpecificCooldowns: {
        ...DEFAULT_ANTI_SPAM_CONFIG.commandSpecificCooldowns,
        ...customConfig?.commandSpecificCooldowns,
      },
    };

    if (this.config.cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupIntervalMs);

      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref();
      }
    }
  }

  public getConfig(): AntiSpamConfig {
    return { ...this.config };
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Acquire an in-memory lock per user to prevent concurrent race conditions.
   */
  private async withLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    while (this.userLocks.has(userId)) {
      if (Date.now() - start > 3000) {
        // Fallback break after 3 seconds to prevent deadlock
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    this.userLocks.add(userId);
    try {
      return await fn();
    } finally {
      this.userLocks.delete(userId);
    }
  }

  /**
   * Determine if a guild member is exempt from anti-spam checks.
   */
  public isExempt(member: GuildMember | null): boolean {
    if (!member) {
      return true;
    }

    if (member.user.bot) {
      return true;
    }

    if (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check if member is currently timed out.
   */
  public isMemberTimedOut(member: GuildMember): boolean {
    if (typeof member.isCommunicationDisabled === "function") {
      return member.isCommunicationDisabled();
    }

    return Boolean(
      member.communicationDisabledUntilTimestamp &&
        member.communicationDisabledUntilTimestamp > Date.now(),
    );
  }

  /**
   * Evaluates message content for flood or duplicate patterns.
   */
  public evaluateMessage(
    userId: string,
    content: string,
    now = Date.now(),
  ): { isSpam: boolean; reason?: string; type?: "flood" | "duplicate" } {
    let record = this.messageRecords.get(userId);
    if (!record) {
      record = { timestamps: [], duplicates: [] };
      this.messageRecords.set(userId, record);
    }

    // 1. Sliding window for flood detection
    record.timestamps = record.timestamps.filter(
      (ts) => now - ts < this.config.messageWindowMs,
    );
    record.timestamps.push(now);

    if (record.timestamps.length > this.config.messageMaxCount) {
      return {
        isSpam: true,
        type: "flood",
        reason: `Flooding pesan (${record.timestamps.length} pesan dalam ${this.config.messageWindowMs / 1000} detik)`,
      };
    }

    // 2. Duplicate message detection
    const normalized = content.trim().toLowerCase();
    if (normalized.length > 0) {
      record.duplicates = record.duplicates.filter(
        (entry) => now - entry.timestamp < this.config.duplicateWindowMs,
      );
      record.duplicates.push({ content: normalized, timestamp: now });

      const sameContentCount = record.duplicates.filter(
        (entry) => entry.content === normalized,
      ).length;

      if (sameContentCount >= this.config.duplicateMaxCount) {
        return {
          isSpam: true,
          type: "duplicate",
          reason: `Mengirim pesan identik berulang (${sameContentCount} kali dalam ${this.config.duplicateWindowMs / 1000} detik)`,
        };
      }
    }

    return { isSpam: false };
  }

  /**
   * Evaluates slash command usage for rate limiting and spam abuse patterns.
   */
  public evaluateCommand(
    userId: string,
    commandName: string,
    now = Date.now(),
  ): {
    allowed: boolean;
    isSpamViolation: boolean;
    retryAfter?: number;
    reason?: string;
  } {
    let record = this.commandRecords.get(userId);
    if (!record) {
      record = {
        commandTimestamps: new Map(),
        allCommandTimestamps: [],
        rateLimitHitTimestamps: [],
      };
      this.commandRecords.set(userId, record);
    }

    const specificCooldown =
      this.config.commandSpecificCooldowns[commandName] ??
      this.config.commandCooldownMs;

    const lastExec = record.commandTimestamps.get(commandName) || 0;
    const timeSinceLast = now - lastExec;

    record.allCommandTimestamps = record.allCommandTimestamps.filter(
      (ts) => now - ts < this.config.commandWindowMs,
    );

    const isCooldownHit = timeSinceLast < specificCooldown;
    const isBurstHit =
      record.allCommandTimestamps.length >= this.config.commandMaxBurst;

    if (isCooldownHit || isBurstHit) {
      // Record rate limit hit
      record.rateLimitHitTimestamps = record.rateLimitHitTimestamps.filter(
        (ts) => now - ts < this.config.commandSpamWindowMs,
      );
      record.rateLimitHitTimestamps.push(now);

      const retryAfterMs = isCooldownHit
        ? specificCooldown - timeSinceLast
        : this.config.commandWindowMs -
          (now - (record.allCommandTimestamps[0] || now));
      const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));

      // Check if user is spamming the command excessively
      if (
        record.rateLimitHitTimestamps.length >= this.config.commandSpamThreshold
      ) {
        return {
          allowed: false,
          isSpamViolation: true,
          retryAfter,
          reason: `Spam slash command /${commandName} (${record.rateLimitHitTimestamps.length} kali terpicu dalam ${this.config.commandSpamWindowMs / 1000} detik)`,
        };
      }

      return {
        allowed: false,
        isSpamViolation: false,
        retryAfter,
        reason: `Command /${commandName} terkena rate limit.`,
      };
    }

    // Normal execution permitted
    record.commandTimestamps.set(commandName, now);
    record.allCommandTimestamps.push(now);

    return { allowed: true, isSpamViolation: false };
  }

  /**
   * Calculate escalation level and punishment duration.
   */
  public recordViolation(userId: string, now = Date.now()): EscalationResult {
    let violation = this.violationRecords.get(userId);

    if (
      !violation ||
      now - violation.lastViolationTime > this.config.violationDecayMs
    ) {
      violation = { level: 1, lastViolationTime: now };
    } else {
      violation.level += 1;
      violation.lastViolationTime = now;
    }

    this.violationRecords.set(userId, violation);

    switch (violation.level) {
      case 1:
        return {
          level: 1,
          timeoutMs: 0,
          durationText: "Peringatan",
          isWarning: true,
        };
      case 2:
        return {
          level: 2,
          timeoutMs: Math.min(
            this.config.escalationLevels.level2TimeoutMs,
            MAX_DISCORD_TIMEOUT_MS,
          ),
          durationText: "1 menit",
          isWarning: false,
        };
      case 3:
        return {
          level: 3,
          timeoutMs: Math.min(
            this.config.escalationLevels.level3TimeoutMs,
            MAX_DISCORD_TIMEOUT_MS,
          ),
          durationText: "10 menit",
          isWarning: false,
        };
      default:
        return {
          level: violation.level,
          timeoutMs: Math.min(
            this.config.escalationLevels.level4TimeoutMs,
            MAX_DISCORD_TIMEOUT_MS,
          ),
          durationText: "1 jam",
          isWarning: false,
        };
    }
  }

  /**
   * Apply punishment (warning or timeout) to a member with error handling and logging.
   */
  public async applyPunishment(
    member: GuildMember,
    client: Client,
    violationReason: string,
    context: "message" | "command",
  ): Promise<EscalationResult> {
    const escalation = this.recordViolation(member.id);

    if (escalation.isWarning) {
      await sendModLog(client, {
        action: "Anti-Spam (Peringatan)",
        moderator: "Noko (Anti-Spam)",
        target: `${member.user.tag} (${member.id})`,
        reason: `${violationReason} • Status: Peringatan (Eskalasi Level 1)`,
      });

      return escalation;
    }

    // Check if member is moderatable
    if (!member.moderatable) {
      console.warn(
        `[AntiSpam] Member ${member.user.tag} (${member.id}) tidak dapat di-timeout oleh Noko (role lebih tinggi atau bot tidak memiliki izin).`,
      );

      await sendModLog(client, {
        action: `Anti-Spam (Gagal: Level ${escalation.level})`,
        moderator: "Noko (Anti-Spam)",
        target: `${member.user.tag} (${member.id})`,
        reason: `${violationReason} • Gagal: Target tidak dapat dimoderasi (posisi role/permission).`,
      });

      return escalation;
    }

    try {
      await member.timeout(
        escalation.timeoutMs,
        `Noko Anti-Spam: ${violationReason} (Level ${escalation.level})`,
      );

      await sendModLog(client, {
        action: `Anti-Spam (Timeout ${escalation.durationText})`,
        moderator: "Noko (Anti-Spam)",
        target: `${member.user.tag} (${member.id})`,
        reason: `${violationReason} • Durasi: ${escalation.durationText} (Eskalasi Level ${escalation.level})`,
      });
    } catch (error) {
      console.error(
        `[AntiSpam] Gagal menerapkan timeout kepada ${member.user.tag}:`,
        error,
      );

      let reasonDetail = "Kesalahan API Discord";
      if (
        error instanceof DiscordAPIError &&
        error.code === RESTJSONErrorCodes.MissingPermissions
      ) {
        reasonDetail = "Bot kekurangan permission Moderate Members";
      }

      await sendModLog(client, {
        action: `Anti-Spam (Error: Level ${escalation.level})`,
        moderator: "Noko (Anti-Spam)",
        target: `${member.user.tag} (${member.id})`,
        reason: `${violationReason} • Gagal timeout: ${reasonDetail}`,
      });
    }

    return escalation;
  }

  /**
   * Main handler for incoming messages.
   */
  public async handleMessage(message: Message): Promise<boolean> {
    if (!message.guild || !message.member || message.author.bot) {
      return false;
    }

    if (this.isExempt(message.member)) {
      return false;
    }

    return this.withLock(message.author.id, async () => {
      const evaluation = this.evaluateMessage(
        message.author.id,
        message.content,
      );

      if (!evaluation.isSpam) {
        return false;
      }

      // Try deleting the spam message
      await message.delete().catch(() => {});

      // If member is already timed out, do not repeatedly punish or escalate
      if (this.isMemberTimedOut(message.member!)) {
        return true;
      }

      const escalation = await this.applyPunishment(
        message.member!,
        message.client,
        evaluation.reason || "Spam pesan terdeteksi",
        "message",
      );

      // Send ephemeral or auto-deleting warning in channel
      if (message.channel && "send" in message.channel) {
        const text = escalation.isWarning
          ? `⚠️ ${message.author}, mohon jangan melakukan spam di server PKH.`
          : `⛔ ${message.author} telah dikenakan timeout selama **${escalation.durationText}** karena spam.`;

        const alertMsg = await message.channel
          .send({
            content: text,
            allowedMentions: { users: [message.author.id] },
          })
          .catch(() => null);

        if (alertMsg) {
          setTimeout(() => alertMsg.delete().catch(() => {}), 5000);
        }
      }

      return true;
    });
  }

  /**
   * Main handler for slash commands.
   */
  public async handleCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    if (!interaction.guild || !interaction.member) {
      return { allowed: true };
    }

    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await interaction.guild.members
            .fetch(interaction.user.id)
            .catch(() => null);

    if (this.isExempt(member)) {
      return { allowed: true };
    }

    // Check if member is already timed out
    if (member && this.isMemberTimedOut(member)) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({
            content: "⛔ Kamu sedang dalam masa timeout.",
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
      return { allowed: false };
    }

    return this.withLock(interaction.user.id, async () => {
      const evalResult = this.evaluateCommand(
        interaction.user.id,
        interaction.commandName,
      );

      if (evalResult.allowed) {
        return { allowed: true };
      }

      if (evalResult.isSpamViolation && member) {
        const escalation = await this.applyPunishment(
          member,
          interaction.client,
          evalResult.reason || "Spam command terdeteksi",
          "command",
        );

        const responseContent = escalation.isWarning
          ? "⚠️ Peringatan: Kamu terdeteksi melakukan spam command secara berlebihan. Harap hentikan atau akunmu akan dikenakan timeout."
          : `⛔ Kamu telah dikenakan timeout selama **${escalation.durationText}** karena melakukan spam command secara berulang.`;

        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({
              content: responseContent,
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        }

        return { allowed: false, retryAfter: evalResult.retryAfter };
      }

      // Normal rate limit cooldown (not a severe spam violation)
      const cooldownMsg = `⏳ Mohon tunggu **${evalResult.retryAfter} detik** sebelum menggunakan command ini lagi.`;

      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({
            content: cooldownMsg,
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }

      return { allowed: false, retryAfter: evalResult.retryAfter };
    });
  }

  /**
   * Purge expired tracking data from memory.
   */
  public cleanup(now = Date.now()): void {
    const maxWindow = Math.max(
      this.config.messageWindowMs,
      this.config.duplicateWindowMs,
      this.config.commandWindowMs,
      this.config.commandSpamWindowMs,
    );

    for (const [userId, record] of this.messageRecords.entries()) {
      record.timestamps = record.timestamps.filter(
        (ts) => now - ts < this.config.messageWindowMs,
      );
      record.duplicates = record.duplicates.filter(
        (entry) => now - entry.timestamp < this.config.duplicateWindowMs,
      );

      if (record.timestamps.length === 0 && record.duplicates.length === 0) {
        this.messageRecords.delete(userId);
      }
    }

    for (const [userId, record] of this.commandRecords.entries()) {
      record.allCommandTimestamps = record.allCommandTimestamps.filter(
        (ts) => now - ts < this.config.commandWindowMs,
      );
      record.rateLimitHitTimestamps = record.rateLimitHitTimestamps.filter(
        (ts) => now - ts < this.config.commandSpamWindowMs,
      );

      for (const [cmd, ts] of record.commandTimestamps.entries()) {
        const cooldown =
          this.config.commandSpecificCooldowns[cmd] ??
          this.config.commandCooldownMs;
        if (now - ts >= cooldown) {
          record.commandTimestamps.delete(cmd);
        }
      }

      if (
        record.allCommandTimestamps.length === 0 &&
        record.rateLimitHitTimestamps.length === 0 &&
        record.commandTimestamps.size === 0
      ) {
        this.commandRecords.delete(userId);
      }
    }

    for (const [userId, record] of this.violationRecords.entries()) {
      if (now - record.lastViolationTime >= this.config.violationDecayMs) {
        this.violationRecords.delete(userId);
      }
    }
  }

  /**
   * Reset tracking for a user (useful in tests).
   */
  public reset(userId?: string): void {
    if (userId) {
      this.messageRecords.delete(userId);
      this.commandRecords.delete(userId);
      this.violationRecords.delete(userId);
    } else {
      this.messageRecords.clear(
        );
      this.commandRecords.clear();
      this.violationRecords.clear();
      this.userLocks.clear();
    }
  }
}

export const antiSpamService = new AntiSpamService();
