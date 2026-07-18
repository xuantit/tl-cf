-- CreateTable
CREATE TABLE "ChangeSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT,
    "zoneId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'done',
    "reversible" BOOLEAN NOT NULL DEFAULT false,
    "jobId" TEXT,
    "metaJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ChangeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "changeSetId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'done',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangeItem_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChangeSet_ownerId_createdAt_idx" ON "ChangeSet"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeSet_zoneId_createdAt_idx" ON "ChangeSet"("zoneId", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeSet_accountId_createdAt_idx" ON "ChangeSet"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeItem_changeSetId_idx" ON "ChangeItem"("changeSetId");
