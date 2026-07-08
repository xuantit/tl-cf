import bcrypt from "bcryptjs";

import { prisma } from "./db.js";
import logger from "../utils/logger.js";
import { env } from "../utils/env.js";
import type {
  ConfigFile,
  ConfigAccount,
  ConfigDomain,
  ConfigUser,
  DomainSettings,
} from "../models/configAccount.js";

type PrismaUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaDomain = {
  id: string;
  accountId: string;
  name: string;
  zoneId: string | null;
  status: string | null;
  settingsJson: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaAccount = {
  id: string;
  label: string | null;
  authType: string;
  email: string | null;
  credentialEncrypted: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  domains?: PrismaDomain[];
};

function mapUser(user: PrismaUser): ConfigUser {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function mapDomain(domain: PrismaDomain): ConfigDomain {
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

function mapAccount(account: PrismaAccount): ConfigAccount {
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

    const userCount = await prisma.user.count();
    if (userCount === 0) {
      const passwordHash = await bcrypt.hash(env.DEFAULT_ADMIN_PASSWORD, 12);
      await prisma.user.create({
        data: {
          email: env.DEFAULT_ADMIN_EMAIL,
          passwordHash,
          role: "admin",
        },
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
    const [users, accounts] = await Promise.all([this.getAllUsers(), this.getAllAccounts()]);
    return { version: "1.0", users, accounts };
  }

  /** No-op: writes are persisted immediately by Prisma. Retained for compatibility. */
  async saveConfig(): Promise<void> {
    // Intentionally empty — Prisma persists on each operation.
  }

  /** Replace the entire dataset (used for import). */
  async setConfig(config: ConfigFile): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.domain.deleteMany();
      await tx.cloudflareAccount.deleteMany();
      await tx.user.deleteMany();

      for (const user of config.users) {
        await tx.user.create({
          data: {
            id: user.id,
            email: user.email,
            passwordHash: user.passwordHash,
            role: user.role,
          },
        });
      }

      // Legacy import format has no per-account owner: assign to the first admin (or first user)
      const owner = config.users.find((u) => u.role === "admin") || config.users[0];
      if (!owner && config.accounts.length > 0) {
        throw new Error("Cannot import accounts without at least one user");
      }

      for (const account of config.accounts) {
        await tx.cloudflareAccount.create({
          data: {
            id: account.id,
            userId: owner.id,
            label: account.label,
            authType: account.authType ?? "globalApiKey",
            email: account.email,
            credentialEncrypted: account.globalApiKeyEncrypted,
            isActive: account.isActive,
            domains: {
              create: (account.domains ?? []).map((d) => ({
                id: d.id,
                name: d.name,
                zoneId: d.zoneId,
                status: d.status,
                settingsJson: d.settings ? JSON.stringify(d.settings) : null,
              })),
            },
          },
        });
      }
    });
    logger.info("Config replaced via setConfig", {
      users: config.users.length,
      accounts: config.accounts.length,
    });
  }

  // ========== Account Operations ==========

  async getAllAccounts(userId?: string): Promise<ConfigAccount[]> {
    const accounts = await prisma.cloudflareAccount.findMany({
      where: userId ? { userId } : undefined,
      include: { domains: true },
      orderBy: { createdAt: "asc" },
    });
    return accounts.map(mapAccount);
  }

  async getAccountById(id: string, userId?: string): Promise<ConfigAccount | null> {
    const account = await prisma.cloudflareAccount.findFirst({
      where: { id, ...(userId ? { userId } : {}) },
      include: { domains: true },
    });
    return account ? mapAccount(account) : null;
  }

  async getAccountByLabel(label: string, userId?: string): Promise<ConfigAccount | null> {
    const account = await prisma.cloudflareAccount.findFirst({
      where: { label, ...(userId ? { userId } : {}) },
      include: { domains: true },
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
    const count = await prisma.cloudflareAccount.count({ where: { userId: accountData.userId } });
    const account = await prisma.cloudflareAccount.create({
      data: {
        userId: accountData.userId,
        label: accountData.label || `Account ${count + 1}`,
        authType: accountData.authType || "globalApiKey",
        email: accountData.email,
        credentialEncrypted: accountData.globalApiKeyEncrypted,
        isActive: true,
      },
      include: { domains: true },
    });
    logger.info("Account added", { accountId: account.id, email: account.email, userId: accountData.userId });
    return mapAccount(account);
  }

  async updateAccount(id: string, updates: Partial<ConfigAccount>, userId?: string): Promise<ConfigAccount> {
    const existing = await prisma.cloudflareAccount.findFirst({
      where: { id, ...(userId ? { userId } : {}) },
    });
    if (!existing) {
      throw new Error(`Account with id ${id} not found`);
    }

    const data: Record<string, unknown> = {};
    if (updates.label !== undefined) data.label = updates.label;
    if (updates.authType !== undefined) data.authType = updates.authType;
    if (updates.email !== undefined) data.email = updates.email;
    if (updates.globalApiKeyEncrypted !== undefined) data.credentialEncrypted = updates.globalApiKeyEncrypted;
    if (updates.isActive !== undefined) data.isActive = updates.isActive;

    const account = await prisma.cloudflareAccount.update({
      where: { id },
      data,
      include: { domains: true },
    });
    logger.info("Account updated", { accountId: id });
    return mapAccount(account);
  }

  async deleteAccount(id: string, userId?: string): Promise<void> {
    const existing = await prisma.cloudflareAccount.findFirst({
      where: { id, ...(userId ? { userId } : {}) },
    });
    if (!existing) {
      throw new Error(`Account with id ${id} not found`);
    }
    await prisma.cloudflareAccount.delete({ where: { id } });
    logger.info("Account deleted", { accountId: id });
  }

  // ========== Domain Operations ==========

  async getAllDomains(accountId: string): Promise<ConfigDomain[]> {
    const account = await prisma.cloudflareAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new Error(`Account with id ${accountId} not found`);
    }
    const domains = await prisma.domain.findMany({
      where: { accountId },
      orderBy: { createdAt: "asc" },
    });
    return domains.map(mapDomain);
  }

  async getDomainByZoneId(accountId: string, zoneId: string): Promise<ConfigDomain | null> {
    const domain = await prisma.domain.findFirst({ where: { accountId, zoneId } });
    return domain ? mapDomain(domain) : null;
  }

  async getDomainByName(accountId: string, name: string): Promise<ConfigDomain | null> {
    const domain = await prisma.domain.findFirst({ where: { accountId, name } });
    return domain ? mapDomain(domain) : null;
  }

  async getDomainById(accountId: string, domainId: string): Promise<ConfigDomain | null> {
    const domain = await prisma.domain.findFirst({ where: { id: domainId, accountId } });
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
    const account = await prisma.cloudflareAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new Error(`Account with id ${accountId} not found`);
    }

    const domain = await prisma.domain.create({
      data: {
        accountId,
        name: domainData.name,
        zoneId: domainData.zoneId,
        status: domainData.status || "active",
        settingsJson: domainData.settings ? JSON.stringify(domainData.settings) : null,
      },
    });
    logger.info("Domain added", { accountId, domainId: domain.id, name: domain.name });
    return mapDomain(domain);
  }

  async updateDomain(
    accountId: string,
    domainId: string,
    updates: Partial<ConfigDomain>
  ): Promise<ConfigDomain> {
    const existing = await prisma.domain.findFirst({ where: { id: domainId, accountId } });
    if (!existing) {
      throw new Error(`Domain with id ${domainId} not found in account ${accountId}`);
    }

    const data: Record<string, unknown> = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.zoneId !== undefined) data.zoneId = updates.zoneId;
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.settings !== undefined) {
      data.settingsJson = updates.settings ? JSON.stringify(updates.settings) : null;
    }

    const domain = await prisma.domain.update({
      where: { id: domainId },
      data,
    });
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
    const existing = await prisma.domain.findFirst({ where: { id: domainId, accountId } });
    if (!existing) {
      throw new Error(`Domain with id ${domainId} not found in account ${accountId}`);
    }
    await prisma.domain.delete({ where: { id: domainId } });
    logger.info("Domain deleted", { accountId, domainId });
  }

  // ========== User Operations (for tool authentication) ==========

  async getAllUsers(): Promise<ConfigUser[]> {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    return users.map(mapUser);
  }

  async getUserById(id: string): Promise<ConfigUser | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? mapUser(user) : null;
  }

  async getUserByEmail(email: string): Promise<ConfigUser | null> {
    const user = await prisma.user.findUnique({ where: { email } });
    return user ? mapUser(user) : null;
  }

  async addUser(userData: {
    email: string;
    passwordHash: string;
    role?: string;
  }): Promise<ConfigUser> {
    const user = await prisma.user.create({
      data: {
        email: userData.email,
        passwordHash: userData.passwordHash,
        role: userData.role || "user",
      },
    });
    logger.info("User added", { userId: user.id, email: user.email });
    return mapUser(user);
  }

  async updateUser(id: string, updates: Partial<ConfigUser>): Promise<ConfigUser> {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`User with id ${id} not found`);
    }

    const data: Record<string, unknown> = {};
    if (updates.email !== undefined) data.email = updates.email;
    if (updates.passwordHash !== undefined) data.passwordHash = updates.passwordHash;
    if (updates.role !== undefined) data.role = updates.role;

    const user = await prisma.user.update({ where: { id }, data });
    logger.info("User updated", { userId: id });
    return mapUser(user);
  }

  async deleteUser(id: string): Promise<void> {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`User with id ${id} not found`);
    }
    await prisma.user.delete({ where: { id } });
    logger.info("User deleted", { userId: id });
  }
}

// Singleton instance
export const configService = new ConfigService();
