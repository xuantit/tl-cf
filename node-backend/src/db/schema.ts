import { randomUUID } from "node:crypto";

import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const uuidPk = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

const createdAt = () => timestamp("createdAt", { mode: "date", precision: 3 }).defaultNow().notNull();

const updatedAt = () =>
  timestamp("updatedAt", { mode: "date", precision: 3 })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

export const users = pgTable("User", {
  id: uuidPk(),
  email: text("email").notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  role: text("role").notNull().default("user"),
  displayName: text("displayName"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// No User row (and no login access) exists until the email owner sets a password.
export const pendingRegistrations = pgTable(
  "PendingRegistration",
  {
    email: text("email").primaryKey(),
    tokenHash: text("tokenHash").notNull().unique(),
    // AES-GCM ciphertext permits safe resends without invalidating an active link.
    // Nullable only for tokens issued before the hardening migration.
    tokenEncrypted: text("tokenEncrypted"),
    expiresAt: timestamp("expiresAt", { mode: "date", precision: 3 }).notNull(),
    requestedAt: timestamp("requestedAt", { mode: "date", precision: 3 }).notNull(),
  },
  (t) => [index("PendingRegistration_expiresAt_idx").on(t.expiresAt)],
);

export const registrationMailQuotas = pgTable(
  "RegistrationMailQuota",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    expiresAt: timestamp("expiresAt", { mode: "date", precision: 3 }).notNull(),
  },
  (t) => [index("RegistrationMailQuota_expiresAt_idx").on(t.expiresAt)],
);

export const sessions = pgTable(
  "Session",
  {
    id: uuidPk(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jti: text("jti").notNull().unique(),
    userAgent: text("userAgent"),
    ip: text("ip"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("lastSeenAt", { mode: "date", precision: 3 }).defaultNow().notNull(),
    revokedAt: timestamp("revokedAt", { mode: "date", precision: 3 }),
  },
  (t) => [index("Session_userId_idx").on(t.userId)]
);

export const cloudflareAccounts = pgTable(
  "CloudflareAccount",
  {
    id: uuidPk(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label"),
    authType: text("authType").notNull().default("globalApiKey"), // globalApiKey | apiToken
    email: text("email"),
    credentialEncrypted: text("credentialEncrypted").notNull(),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("CloudflareAccount_userId_idx").on(t.userId)]
);

export const domains = pgTable(
  "Domain",
  {
    id: uuidPk(),
    accountId: text("accountId")
      .notNull()
      .references(() => cloudflareAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    zoneId: text("zoneId"),
    status: text("status").default("active"),
    settingsJson: text("settingsJson"), // JSON-serialized DomainSettings
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("Domain_accountId_idx").on(t.accountId)]
);

export const tags = pgTable(
  "Tag",
  {
    id: uuidPk(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    templateId: text("templateId"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("Tag_userId_name_key").on(t.userId, t.name)]
);

export const tagRules = pgTable(
  "TagRule",
  {
    id: uuidPk(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    field: text("field").notNull(), // "name" | "plan"
    op: text("op").notNull(), // "endsWith" | "startsWith" | "contains" | "equals"
    value: text("value").notNull(),
    tag: text("tag").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("TagRule_userId_idx").on(t.userId)]
);

export const dnsTemplates = pgTable(
  "DnsTemplate",
  {
    id: uuidPk(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    recordsJson: text("recordsJson").notNull(), // JSON array of {type, name, content, ttl?, proxied?, priority?}
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("DnsTemplate_userId_idx").on(t.userId)]
);

export const inviteCodes = pgTable("InviteCode", {
  id: uuidPk(),
  code: text("code").notNull().unique(),
  note: text("note"),
  maxUses: integer("maxUses").notNull().default(1),
  usedCount: integer("usedCount").notNull().default(0),
  usedByJson: text("usedByJson").notNull().default("[]"), // JSON array of emails that registered with this code
  expiresAt: timestamp("expiresAt", { mode: "date", precision: 3 }),
  createdBy: text("createdBy").notNull(), // admin userId
  createdAt: createdAt(),
});

export const auditLogs = pgTable(
  "AuditLog",
  {
    id: uuidPk(),
    userId: text("userId"),
    email: text("email"),
    method: text("method").notNull(),
    path: text("path").notNull(),
    status: integer("status").notNull(),
    metaJson: text("metaJson"), // JSON body đã redact các field nhạy cảm
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("AuditLog_createdAt_idx").on(t.createdAt),
    index("AuditLog_userId_createdAt_idx").on(t.userId, t.createdAt),
  ]
);

export const bulkJobs = pgTable(
  "BulkJob",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(), // bulk-purge | bulk-delete | create-zones | dns-replace | apply-template
    ownerId: text("ownerId").notNull(),
    status: text("status").notNull(), // running | done
    total: integer("total").notNull(),
    processed: integer("processed").notNull().default(0),
    succeeded: integer("succeeded").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    itemsJson: text("itemsJson").notNull(), // JSON array of BulkJobItem
    createdAt: createdAt(),
    finishedAt: timestamp("finishedAt", { mode: "date", precision: 3 }),
  },
  (t) => [index("BulkJob_ownerId_createdAt_idx").on(t.ownerId, t.createdAt)]
);

export const changeSets = pgTable(
  "ChangeSet",
  {
    id: uuidPk(),
    ownerId: text("ownerId").notNull(),
    accountId: text("accountId"),
    zoneId: text("zoneId"),
    action: text("action").notNull(),
    status: text("status").notNull().default("done"), // pending | done | failed | rollback_requested | rolled_back
    reversible: boolean("reversible").notNull().default(false),
    jobId: text("jobId"),
    metaJson: text("metaJson"), // JSON metadata
    createdAt: createdAt(),
    finishedAt: timestamp("finishedAt", { mode: "date", precision: 3 }),
  },
  (t) => [
    index("ChangeSet_ownerId_createdAt_idx").on(t.ownerId, t.createdAt),
    index("ChangeSet_zoneId_createdAt_idx").on(t.zoneId, t.createdAt),
    index("ChangeSet_accountId_createdAt_idx").on(t.accountId, t.createdAt),
  ]
);

export const changeItems = pgTable(
  "ChangeItem",
  {
    id: uuidPk(),
    changeSetId: text("changeSetId")
      .notNull()
      .references(() => changeSets.id, { onDelete: "cascade" }),
    resourceType: text("resourceType").notNull(),
    resourceId: text("resourceId").notNull(),
    beforeJson: text("beforeJson"),
    afterJson: text("afterJson"),
    status: text("status").notNull().default("done"), // pending | done | failed | skipped
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("ChangeItem_changeSetId_idx").on(t.changeSetId)]
);

// ===== Relations (dùng cho db.query.* with) =====

export const usersRelations = relations(users, ({ many }) => ({
  cfAccounts: many(cloudflareAccounts),
  sessions: many(sessions),
  tags: many(tags),
  tagRules: many(tagRules),
  dnsTemplates: many(dnsTemplates),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const cloudflareAccountsRelations = relations(cloudflareAccounts, ({ one, many }) => ({
  user: one(users, { fields: [cloudflareAccounts.userId], references: [users.id] }),
  domains: many(domains),
}));

export const domainsRelations = relations(domains, ({ one }) => ({
  account: one(cloudflareAccounts, { fields: [domains.accountId], references: [cloudflareAccounts.id] }),
}));

export const tagsRelations = relations(tags, ({ one }) => ({
  user: one(users, { fields: [tags.userId], references: [users.id] }),
}));

export const tagRulesRelations = relations(tagRules, ({ one }) => ({
  user: one(users, { fields: [tagRules.userId], references: [users.id] }),
}));

export const dnsTemplatesRelations = relations(dnsTemplates, ({ one }) => ({
  user: one(users, { fields: [dnsTemplates.userId], references: [users.id] }),
}));

export const changeSetsRelations = relations(changeSets, ({ many }) => ({
  items: many(changeItems),
}));

export const changeItemsRelations = relations(changeItems, ({ one }) => ({
  changeSet: one(changeSets, { fields: [changeItems.changeSetId], references: [changeSets.id] }),
}));

// ===== Row types =====

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type CloudflareAccountRow = typeof cloudflareAccounts.$inferSelect;
export type DomainRow = typeof domains.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type TagRuleRow = typeof tagRules.$inferSelect;
export type DnsTemplateRow = typeof dnsTemplates.$inferSelect;
export type InviteCodeRow = typeof inviteCodes.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
export type BulkJobRow = typeof bulkJobs.$inferSelect;
export type ChangeSetRow = typeof changeSets.$inferSelect;
export type ChangeItemRow = typeof changeItems.$inferSelect;
