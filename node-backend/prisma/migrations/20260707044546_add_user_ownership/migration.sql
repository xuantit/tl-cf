/*
  Warnings:

  - Added the required column `userId` to the `CloudflareAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `DnsTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CloudflareAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "authType" TEXT NOT NULL DEFAULT 'globalApiKey',
    "email" TEXT,
    "credentialEncrypted" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CloudflareAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CloudflareAccount" ("userId", "authType", "createdAt", "credentialEncrypted", "email", "id", "isActive", "label", "updatedAt") SELECT (SELECT "id" FROM "User" ORDER BY CASE WHEN "role" = 'admin' THEN 0 ELSE 1 END, "createdAt" LIMIT 1), "authType", "createdAt", "credentialEncrypted", "email", "id", "isActive", "label", "updatedAt" FROM "CloudflareAccount";
DROP TABLE "CloudflareAccount";
ALTER TABLE "new_CloudflareAccount" RENAME TO "CloudflareAccount";
CREATE INDEX "CloudflareAccount_userId_idx" ON "CloudflareAccount"("userId");
CREATE TABLE "new_DnsTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "recordsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DnsTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DnsTemplate" ("userId", "createdAt", "description", "id", "name", "recordsJson", "updatedAt") SELECT (SELECT "id" FROM "User" ORDER BY CASE WHEN "role" = 'admin' THEN 0 ELSE 1 END, "createdAt" LIMIT 1), "createdAt", "description", "id", "name", "recordsJson", "updatedAt" FROM "DnsTemplate";
DROP TABLE "DnsTemplate";
ALTER TABLE "new_DnsTemplate" RENAME TO "DnsTemplate";
CREATE INDEX "DnsTemplate_userId_idx" ON "DnsTemplate"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
