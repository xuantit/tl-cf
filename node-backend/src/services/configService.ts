import bcrypt from "bcryptjs";
import { asc, count, eq, and } from "drizzle-orm";

import { db } from "./db.js";
import {
  users,
  cloudflareAccounts,
  domains,
  type UserRow,
  type DomainRow,
  type CloudflareAccountRow,
} from "../db/schema.js";
import logger from "../utils/logger.js";
import { env } from "../utils/env.js";
import type {
  ConfigFile,
  ConfigAccount,
  ConfigDomain,
  ConfigUser,
  DomainSettings,
} from "../models/configAccount.js";

type AccountWithDomains = CloudflareAccountRow & { domains?: DomainRow[] };

function mapUser(user: UserRow): ConfigUser {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function mapDomain(domain: DomainRow): ConfigDomain {
  let settings: DomainSettings | undefined;
  if (domain.settingsJson) {
    try {
      settings = JSON.parse(domain.settingsJson) as DomainSettings;
    } catch (error: any) {
      logger.warn("Failed to parse domain settingsJson", { domainId: domain.id, error: error.message });
    }
  }
  return {
    id: domain.id,
    name: domain.name,
    zoneId: domain.zoneId ?? undefined,
    status: domain.status ?? undefined,
    settings,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
  };
}

function mapAccount(account: AccountWithDomains): ConfigAccount {
  return {
    id: account.id,
    label: account.label ?? undefined,
    authType: (account.authType as "globalApiKey" | "apiToken") ?? "globalApiKey",
    email: account.email ?? undefined,
    globalApiKeyEncrypted: account.credentialEncrypted,
    isActive: account.isActive,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
    domains: (account.domains ?? []).map(mapDomain),
  };
}

class ConfigService {
  private adminSeeded = false;

  private async ensureDefaultAdmin(): Promise<void> {
    if (this.adminSeeded || !env.AUTO_SEED_DEFAULT_ADMIN) {
      this.adminSeeded = true;
      return;
    }

    const [{ value: userCount }] = await db.select({ value: count() }).from(users);
    if (userCount === 0) {
      const passwordHash = await bcrypt.hash(env.DEFAULT_ADMIN_PASSWORD, 12);
      await db.insert(users).values({
        email: env.DEFAULT_ADMIN_EMAIL,
        passwordHash,
        role: "admin",
      });
      logger.warn("Seeded default admin account because database had no users", {
        email: env.DEFAULT_ADMIN_EMAIL,
      });
    }

    this.adminSeeded = true;
  }

  /**
   * Ensure the database is ready (seed default admin if needed).
   * Kept for backward compatibility with callers that expect a ConfigFile.
   */
  async loadConfig(): Promise<ConfigFile> {
    await this.ensureDefaultAdmin();
    const [allUsers, accounts] = await Promise.all([this.getAllUsers(), this.getAllAccounts()]);
    return { version: "1.0", users: allUsers, accounts };
  }

  /** No-op: writes are persisted immediately by the database. Retained for compatibility. */
  async saveConfig(): Promise<void> {
    // Intentionally empty — writes persist on each operation.
  }

  /** Replace the entire dataset (used for import). */
  async setConfig(config: ConfigFile): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(domains);
      await tx.delete(cloudflareAccounts);
      await tx.delete(users);

      for (const user of config.users) {
        await tx.insert(users).values({
          id: user.id,
          email: user.email,
          passwordHash: user.passwordHash,
          role: user.role,
        });
      }

      // Legacy import format has no per-account owner: assign to the first admin (or first user)
      const owner = config.users.find((u) => u.role === "admin") || config.users[0];
      if (!owner && config.accounts.length > 0) {
        throw new Error("Cannot import accounts without at least one user");
      }

      for (const account of config.accounts) {
        await tx.insert(cloudflareAccounts).values({
          id: account.id,
          userId: owner.id,
          label: account.label,
          authType: account.authType ?? "globalApiKey",
          email: account.email,
          credentialEncrypted: account.globalApiKeyEncrypted,
          isActive: account.isActive,
        });
        const accountDomains = account.domains ?? [];
        if (accountDomains.length > 0) {
          await tx.insert(domains).values(
            accountDomains.map((d) => ({
              id: d.id,
              accountId: account.id,
              name: d.name,
              zoneId: d.zoneId,
              status: d.status,
              settingsJson: d.settings ? JSON.stringify(d.settings) : null,
            }))
          );
        }
      }
    });
    logger.info("Config replaced via setConfig", {
      users: config.users.length,
      accounts: config.accounts.length,
    });
  }

  // ========== Account Operations ==========

  async getAllAccounts(userId?: string): Promise<ConfigAccount[]> {
    const accounts = await db.query.cloudflareAccounts.findMany({
      where: userId ? eq(cloudflareAccounts.userId, userId) : undefined,
      with: { domains: true },
      orderBy: asc(cloudflareAccounts.createdAt),
    });
    return accounts.map(mapAccount);
  }

  async getAccountById(id: string, userId?: string): Promise<ConfigAccount | null> {
    const account = await db.query.cloudflareAccounts.findFirst({
      where: userId
        ? and(eq(cloudflareAccounts.id, id), eq(cloudflareAccounts.userId, userId))
        : eq(cloudflareAccounts.id, id),
      with: { domains: true },
    });
    return account ? mapAccount(account) : null;
  }

  async getAccountByLabel(label: string, userId?: string): Promise<ConfigAccount | null> {
    const account = await db.query.cloudflareAccounts.findFirst({
      where: userId
        ? and(eq(cloudflareAccounts.label, label), eq(cloudflareAccounts.userId, userId))
        : eq(cloudflareAccounts.label, label),
      with: { domains: true },
    });
    return account ? mapAccount(account) : null;
  }

  async addAccount(accountData: {
    userId: string;
    label?: string;
    email?: string;
    authType?: "globalApiKey" | "apiToken";
    globalApiKeyEncrypted: string;
  }): Promise<ConfigAccount> {
    const [{ value: accountCount }] = await db
      .select({ value: count() })
      .from(cloudflareAccounts)
      .where(eq(cloudflareAccounts.userId, accountData.userId));
    const [account] = await db
      .insert(cloudflareAccounts)
      .values({
        userId: accountData.userId,
        label: accountData.label || `Account ${accountCount + 1}`,
        authType: accountData.authType || "globalApiKey",
        email: accountData.email,
        credentialEncrypted: accountData.globalApiKeyEncrypted,
        isActive: true,
      })
      .returning();
    logger.info("Account added", { accountId: account.id, email: account.email, userId: accountData.userId });
    return mapAccount({ ...account, domains: [] });
  }

  async updateAccount(id: string, updates: Partial<ConfigAccount>, userId?: string): Promise<ConfigAccount> {
    const existing = await db.query.cloudflareAccounts.findFirst({
      where: userId
        ? and(eq(cloudflareAccounts.id, id), eq(cloudflareAccounts.userId, userId))
        : eq(cloudflareAccounts.id, id),
    });
    if (!existing) {
      throw new Error(`Account with id ${id} not found`);
    }

    const data: Partial<typeof cloudflareAccounts.$inferInsert> = {};
    if (updates.label !== undefined) data.label = updates.label;
    if (updates.authType !== undefined) data.authType = updates.authType;
    if (updates.email !== undefined) data.email = updates.email;
    if (updates.globalApiKeyEncrypted !== undefined) data.credentialEncrypted = updates.globalApiKeyEncrypted;
    if (updates.isActive !== undefined) data.isActive = updates.isActive;

    const [account] = await db
      .update(cloudflareAccounts)
      .set(data)
      .where(eq(cloudflareAccounts.id, id))
      .returning();
    const accountDomains = await db.query.domains.findMany({ where: eq(domains.accountId, id) });
    logger.info("Account updated", { accountId: id });
    return mapAccount({ ...account, domains: accountDomains });
  }

  async deleteAccount(id: string, userId?: string): Promise<void> {
    const existing = await db.query.cloudflareAccounts.findFirst({
      where: userId
        ? and(eq(cloudflareAccounts.id, id), eq(cloudflareAccounts.userId, userId))
        : eq(cloudflareAccounts.id, id),
    });
    if (!existing) {
      throw new Error(`Account with id ${id} not found`);
    }
    await db.delete(cloudflareAccounts).where(eq(cloudflareAccounts.id, id));
    logger.info("Account deleted", { accountId: id });
  }

  // ========== Domain Operations ==========

  async getAllDomains(accountId: string): Promise<ConfigDomain[]> {
    const account = await db.query.cloudflareAccounts.findFirst({
      where: eq(cloudflareAccounts.id, accountId),
    });
    if (!account) {
      throw new Error(`Account with id ${accountId} not found`);
    }
    const rows = await db.query.domains.findMany({
      where: eq(domains.accountId, accountId),
      orderBy: asc(domains.createdAt),
    });
    return rows.map(mapDomain);
  }

  async getDomainByZoneId(accountId: string, zoneId: string): Promise<ConfigDomain | null> {
    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.accountId, accountId), eq(domains.zoneId, zoneId)),
    });
    return domain ? mapDomain(domain) : null;
  }

  async getDomainByName(accountId: string, name: string): Promise<ConfigDomain | null> {
    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.accountId, accountId), eq(domains.name, name)),
    });
    return domain ? mapDomain(domain) : null;
  }

  async getDomainById(accountId: string, domainId: string): Promise<ConfigDomain | null> {
    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.id, domainId), eq(domains.accountId, accountId)),
    });
    return domain ? mapDomain(domain) : null;
  }

  async addDomain(
    accountId: string,
    domainData: {
      name: string;
      zoneId?: string;
      status?: string;
      settings?: DomainSettings;
    }
  ): Promise<ConfigDomain> {
    const account = await db.query.cloudflareAccounts.findFirst({
      where: eq(cloudflareAccounts.id, accountId),
    });
    if (!account) {
      throw new Error(`Account with id ${accountId} not found`);
    }

    const [domain] = await db
      .insert(domains)
      .values({
        accountId,
        name: domainData.name,
        zoneId: domainData.zoneId,
        status: domainData.status || "active",
        settingsJson: domainData.settings ? JSON.stringify(domainData.settings) : null,
      })
      .returning();
    logger.info("Domain added", { accountId, domainId: domain.id, name: domain.name });
    return mapDomain(domain);
  }

  async updateDomain(
    accountId: string,
    domainId: string,
    updates: Partial<ConfigDomain>
  ): Promise<ConfigDomain> {
    const existing = await db.query.domains.findFirst({
      where: and(eq(domains.id, domainId), eq(domains.accountId, accountId)),
    });
    if (!existing) {
      throw new Error(`Domain with id ${domainId} not found in account ${accountId}`);
    }

    const data: Partial<typeof domains.$inferInsert> = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.zoneId !== undefined) data.zoneId = updates.zoneId;
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.settings !== undefined) {
      data.settingsJson = updates.settings ? JSON.stringify(updates.settings) : null;
    }

    const [domain] = await db.update(domains).set(data).where(eq(domains.id, domainId)).returning();
    logger.info("Domain updated", { accountId, domainId });
    return mapDomain(domain);
  }

  async updateDomainSettings(
    accountId: string,
    domainId: string,
    settings: DomainSettings
  ): Promise<ConfigDomain> {
    const domain = await this.getDomainById(accountId, domainId);
    if (!domain) {
      throw new Error(`Domain with id ${domainId} not found in account ${accountId}`);
    }

    return this.updateDomain(accountId, domainId, {
      settings: {
        ...domain.settings,
        ...settings,
      },
    });
  }

  async deleteDomain(accountId: string, domainId: string): Promise<void> {
    const existing = await db.query.domains.findFirst({
      where: and(eq(domains.id, domainId), eq(domains.accountId, accountId)),
    });
    if (!existing) {
      throw new Error(`Domain with id ${domainId} not found in account ${accountId}`);
    }
    await db.delete(domains).where(eq(domains.id, domainId));
    logger.info("Domain deleted", { accountId, domainId });
  }

  // ========== User Operations (for tool authentication) ==========

  async getAllUsers(): Promise<ConfigUser[]> {
    const rows = await db.query.users.findMany({ orderBy: asc(users.createdAt) });
    return rows.map(mapUser);
  }

  async getUserById(id: string): Promise<ConfigUser | null> {
    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    return user ? mapUser(user) : null;
  }

  async getUserByEmail(email: string): Promise<ConfigUser | null> {
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    return user ? mapUser(user) : null;
  }

  async addUser(userData: {
    email: string;
    passwordHash: string;
    role?: string;
  }): Promise<ConfigUser> {
    const [user] = await db
      .insert(users)
      .values({
        email: userData.email,
        passwordHash: userData.passwordHash,
        role: userData.role || "user",
      })
      .returning();
    logger.info("User added", { userId: user.id, email: user.email });
    return mapUser(user);
  }

  async updateUser(id: string, updates: Partial<ConfigUser>): Promise<ConfigUser> {
    const existing = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!existing) {
      throw new Error(`User with id ${id} not found`);
    }

    const data: Partial<typeof users.$inferInsert> = {};
    if (updates.email !== undefined) data.email = updates.email;
    if (updates.passwordHash !== undefined) data.passwordHash = updates.passwordHash;
    if (updates.role !== undefined) data.role = updates.role;

    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    logger.info("User updated", { userId: id });
    return mapUser(user);
  }

  async deleteUser(id: string): Promise<void> {
    const existing = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!existing) {
      throw new Error(`User with id ${id} not found`);
    }
    await db.delete(users).where(eq(users.id, id));
    logger.info("User deleted", { userId: id });
  }
}

// Singleton instance
export const configService = new ConfigService();
