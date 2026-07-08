import { z } from "zod";

// DNS Record Schema
export const DnsRecordSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  content: z.string(),
  ttl: z.number().optional(),
  proxied: z.boolean().optional(),
  priority: z.number().optional(),
});

export type DnsRecord = z.infer<typeof DnsRecordSchema>;

// Page Rule Schema
export const PageRuleSchema = z.object({
  id: z.string(),
  priority: z.number(),
  status: z.string(),
  targets: z.array(z.any()).optional(),
  actions: z.array(z.any()).optional(),
});

export type PageRule = z.infer<typeof PageRuleSchema>;

// Cache Settings Schema
export const CacheSettingsSchema = z.object({
  cacheLevel: z.string().optional(),
  browserCacheTtl: z.number().optional(),
  tieredCacheTopology: z.string().optional(),
});

export type CacheSettings = z.infer<typeof CacheSettingsSchema>;

// Domain Settings Schema
export const DomainSettingsSchema = z.object({
  sslMode: z.enum(["off", "flexible", "full", "strict"]).optional(),
  cache: CacheSettingsSchema.optional(),
  tieredCacheTopology: z.string().optional(),
  dnsRecords: z.array(DnsRecordSchema).optional(),
  pageRules: z.array(PageRuleSchema).optional(),
  tags: z.array(z.string()).optional(),
});

export type DomainSettings = z.infer<typeof DomainSettingsSchema>;

// Domain Schema
export const ConfigDomainSchema = z.object({
  id: z.string(),
  name: z.string(),
  zoneId: z.string().optional(),
  status: z.string().optional(),
  settings: DomainSettingsSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ConfigDomain = z.infer<typeof ConfigDomainSchema>;

// Account Schema
export const ConfigAccountSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  authType: z.enum(["globalApiKey", "apiToken"]).default("globalApiKey"),
  email: z.string().email().optional(),
  globalApiKeyEncrypted: z.string(),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
  domains: z.array(ConfigDomainSchema).default([]),
});

export type ConfigAccount = z.infer<typeof ConfigAccountSchema>;

// User Schema (for tool login)
export const ConfigUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  passwordHash: z.string(),
  role: z.string().default("user"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ConfigUser = z.infer<typeof ConfigUserSchema>;

// Config File Schema
export const ConfigFileSchema = z.object({
  version: z.string(),
  users: z.array(ConfigUserSchema).default([]),
  accounts: z.array(ConfigAccountSchema),
});

export type ConfigFile = z.infer<typeof ConfigFileSchema>;

// Default config structure
export const DEFAULT_CONFIG: ConfigFile = {
  version: "1.0",
  users: [],
  accounts: [],
};
