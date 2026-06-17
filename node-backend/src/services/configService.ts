import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import logger from "../utils/logger.js";
import {
  ConfigFile,
  ConfigAccount,
  ConfigDomain,
  ConfigUser,
  DomainSettings,
  DEFAULT_CONFIG,
  ConfigFileSchema,
} from "../models/configAccount.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config file path: ./config/accounts.json (relative to project root)
const CONFIG_DIR = path.join(__dirname, "../../config");
const CONFIG_FILE = path.join(CONFIG_DIR, "accounts.json");
const BACKUP_DIR = path.join(CONFIG_DIR, "backups");

class ConfigService {
  private config: ConfigFile | null = null;

  /**
   * Ensure config directory and backup directory exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      await fs.mkdir(BACKUP_DIR, { recursive: true });
    } catch (error: any) {
      logger.error("Failed to create config directories", { error: error.message });
      throw new Error(`Failed to create config directories: ${error.message}`);
    }
  }

  /**
   * Create backup of current config file
   */
  private async createBackup(): Promise<void> {
    try {
      const stats = await fs.stat(CONFIG_FILE).catch(() => null);
      if (!stats) return; // No file to backup

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFile = path.join(BACKUP_DIR, `accounts-${timestamp}.json`);
      await fs.copyFile(CONFIG_FILE, backupFile);
      logger.info("Created config backup", { backupFile });
    } catch (error: any) {
      logger.warn("Failed to create backup", { error: error.message });
      // Don't throw - backup failure shouldn't block saves
    }
  }

  /**
   * Load config from file
   */
  async loadConfig(): Promise<ConfigFile> {
    try {
      await this.ensureDirectories();

      const data = await fs.readFile(CONFIG_FILE, "utf-8").catch(() => null);
      if (!data) {
        logger.info("Config file not found, creating default");
        this.config = DEFAULT_CONFIG;
        await this.saveConfig();
        return this.config;
      }

      const parsed = JSON.parse(data);
      // Ensure users array exists for backward compatibility
      if (!parsed.users) {
        parsed.users = [];
      }
      const validated = ConfigFileSchema.parse(parsed);
      this.config = validated;
      logger.info("Config loaded successfully", { 
        usersCount: validated.users?.length || 0,
        accountsCount: validated.accounts.length 
      });
      return validated;
    } catch (error: any) {
      logger.error("Failed to load config", { error: error.message });
      if (error.name === "ZodError") {
        throw new Error(`Invalid config file format: ${error.message}`);
      }
      throw new Error(`Failed to load config: ${error.message}`);
    }
  }

  /**
   * Save config to file with atomic write
   */
  async saveConfig(): Promise<void> {
    if (!this.config) {
      throw new Error("No config loaded. Call loadConfig() first.");
    }

    try {
      await this.ensureDirectories();
      await this.createBackup();

      // Atomic write: write to temp file first, then rename
      const tempFile = `${CONFIG_FILE}.tmp`;
      const jsonData = JSON.stringify(this.config, null, 2);
      await fs.writeFile(tempFile, jsonData, "utf-8");
      await fs.rename(tempFile, CONFIG_FILE);

      // Set file permissions (read/write for owner only)
      await fs.chmod(CONFIG_FILE, 0o600).catch(() => {
        // chmod may fail on Windows, that's okay
      });

      logger.info("Config saved successfully", { accountsCount: this.config.accounts.length });
    } catch (error: any) {
      logger.error("Failed to save config", { error: error.message });
      throw new Error(`Failed to save config: ${error.message}`);
    }
  }

  /**
   * Get config (load if not already loaded)
   */
  private async getConfig(): Promise<ConfigFile> {
    if (!this.config) {
      await this.loadConfig();
    }
    return this.config!;
  }

  /**
   * Set config (for import functionality)
   */
  async setConfig(config: ConfigFile): Promise<void> {
    const validated = ConfigFileSchema.parse(config);
    this.config = validated;
    await this.saveConfig();
  }

  // ========== Account Operations ==========

  async getAllAccounts(): Promise<ConfigAccount[]> {
    const config = await this.getConfig();
    return config.accounts;
  }

  async getAccountById(id: string): Promise<ConfigAccount | null> {
    const config = await this.getConfig();
    return config.accounts.find((acc) => acc.id === id) || null;
  }

  async getAccountByLabel(label: string): Promise<ConfigAccount | null> {
    const config = await this.getConfig();
    return config.accounts.find((acc) => acc.label === label) || null;
  }

  async addAccount(accountData: {
    label?: string;
    email: string;
    globalApiKeyEncrypted: string;
  }): Promise<ConfigAccount> {
    const config = await this.getConfig();

    const newAccount: ConfigAccount = {
      id: randomUUID(),
      label: accountData.label || `Account ${config.accounts.length + 1}`,
      email: accountData.email,
      globalApiKeyEncrypted: accountData.globalApiKeyEncrypted,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      domains: [],
    };

    config.accounts.push(newAccount);
    await this.saveConfig();

    logger.info("Account added", { accountId: newAccount.id, email: newAccount.email });
    return newAccount;
  }

  async updateAccount(id: string, updates: Partial<ConfigAccount>): Promise<ConfigAccount> {
    const config = await this.getConfig();
    const accountIndex = config.accounts.findIndex((acc) => acc.id === id);

    if (accountIndex === -1) {
      throw new Error(`Account with id ${id} not found`);
    }

    const updatedAccount: ConfigAccount = {
      ...config.accounts[accountIndex],
      ...updates,
      id, // Prevent ID changes
      updatedAt: new Date().toISOString(),
    };

    config.accounts[accountIndex] = updatedAccount;
    await this.saveConfig();

    logger.info("Account updated", { accountId: id });
    return updatedAccount;
  }

  async deleteAccount(id: string): Promise<void> {
    const config = await this.getConfig();
    const accountIndex = config.accounts.findIndex((acc) => acc.id === id);

    if (accountIndex === -1) {
      throw new Error(`Account with id ${id} not found`);
    }

    config.accounts.splice(accountIndex, 1);
    await this.saveConfig();

    logger.info("Account deleted", { accountId: id });
  }

  // ========== Domain Operations ==========

  async getAllDomains(accountId: string): Promise<ConfigDomain[]> {
    const account = await this.getAccountById(accountId);
    if (!account) {
      throw new Error(`Account with id ${accountId} not found`);
    }
    return account.domains;
  }

  async getDomainByZoneId(accountId: string, zoneId: string): Promise<ConfigDomain | null> {
    const domains = await this.getAllDomains(accountId);
    return domains.find((dom) => dom.zoneId === zoneId) || null;
  }

  async getDomainByName(accountId: string, name: string): Promise<ConfigDomain | null> {
    const domains = await this.getAllDomains(accountId);
    return domains.find((dom) => dom.name === name) || null;
  }

  async getDomainById(accountId: string, domainId: string): Promise<ConfigDomain | null> {
    const domains = await this.getAllDomains(accountId);
    return domains.find((dom) => dom.id === domainId) || null;
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
    const config = await this.getConfig();
    const accountIndex = config.accounts.findIndex((acc) => acc.id === accountId);

    if (accountIndex === -1) {
      throw new Error(`Account with id ${accountId} not found`);
    }

    const newDomain: ConfigDomain = {
      id: randomUUID(),
      name: domainData.name,
      zoneId: domainData.zoneId,
      status: domainData.status || "active",
      settings: domainData.settings,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    config.accounts[accountIndex].domains.push(newDomain);
    await this.saveConfig();

    logger.info("Domain added", { accountId, domainId: newDomain.id, name: newDomain.name });
    return newDomain;
  }

  async updateDomain(
    accountId: string,
    domainId: string,
    updates: Partial<ConfigDomain>
  ): Promise<ConfigDomain> {
    const config = await this.getConfig();
    const accountIndex = config.accounts.findIndex((acc) => acc.id === accountId);

    if (accountIndex === -1) {
      throw new Error(`Account with id ${accountId} not found`);
    }

    const domainIndex = config.accounts[accountIndex].domains.findIndex((dom) => dom.id === domainId);
    if (domainIndex === -1) {
      throw new Error(`Domain with id ${domainId} not found in account ${accountId}`);
    }

    const updatedDomain: ConfigDomain = {
      ...config.accounts[accountIndex].domains[domainIndex],
      ...updates,
      id: domainId, // Prevent ID changes
      updatedAt: new Date().toISOString(),
    };

    config.accounts[accountIndex].domains[domainIndex] = updatedDomain;
    await this.saveConfig();

    logger.info("Domain updated", { accountId, domainId });
    return updatedDomain;
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
    const config = await this.getConfig();
    const accountIndex = config.accounts.findIndex((acc) => acc.id === accountId);

    if (accountIndex === -1) {
      throw new Error(`Account with id ${accountId} not found`);
    }

    const domainIndex = config.accounts[accountIndex].domains.findIndex((dom) => dom.id === domainId);
    if (domainIndex === -1) {
      throw new Error(`Domain with id ${domainId} not found in account ${accountId}`);
    }

    config.accounts[accountIndex].domains.splice(domainIndex, 1);
    await this.saveConfig();

    logger.info("Domain deleted", { accountId, domainId });
  }

  // ========== User Operations (for tool authentication) ==========

  async getAllUsers(): Promise<ConfigUser[]> {
    const config = await this.getConfig();
    return config.users || [];
  }

  async getUserById(id: string): Promise<ConfigUser | null> {
    const config = await this.getConfig();
    return (config.users || []).find((user) => user.id === id) || null;
  }

  async getUserByEmail(email: string): Promise<ConfigUser | null> {
    const config = await this.getConfig();
    return (config.users || []).find((user) => user.email === email) || null;
  }

  async addUser(userData: {
    email: string;
    passwordHash: string;
    role?: string;
  }): Promise<ConfigUser> {
    const config = await this.getConfig();

    const newUser: ConfigUser = {
      id: randomUUID(),
      email: userData.email,
      passwordHash: userData.passwordHash,
      role: userData.role || "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!config.users) {
      config.users = [];
    }
    config.users.push(newUser);
    await this.saveConfig();

    logger.info("User added", { userId: newUser.id, email: newUser.email });
    return newUser;
  }

  async updateUser(id: string, updates: Partial<ConfigUser>): Promise<ConfigUser> {
    const config = await this.getConfig();
    if (!config.users) {
      throw new Error(`User with id ${id} not found`);
    }

    const userIndex = config.users.findIndex((user) => user.id === id);
    if (userIndex === -1) {
      throw new Error(`User with id ${id} not found`);
    }

    const updatedUser: ConfigUser = {
      ...config.users[userIndex],
      ...updates,
      id, // Prevent ID changes
      updatedAt: new Date().toISOString(),
    };

    config.users[userIndex] = updatedUser;
    await this.saveConfig();

    logger.info("User updated", { userId: id });
    return updatedUser;
  }

  async deleteUser(id: string): Promise<void> {
    const config = await this.getConfig();
    if (!config.users) {
      throw new Error(`User with id ${id} not found`);
    }

    const userIndex = config.users.findIndex((user) => user.id === id);
    if (userIndex === -1) {
      throw new Error(`User with id ${id} not found`);
    }

    config.users.splice(userIndex, 1);
    await this.saveConfig();

    logger.info("User deleted", { userId: id });
  }
}

// Singleton instance
export const configService = new ConfigService();
