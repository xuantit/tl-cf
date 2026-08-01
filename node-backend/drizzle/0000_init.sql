CREATE TABLE "AuditLog" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"email" text,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status" integer NOT NULL,
	"metaJson" text,
	"ip" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "BulkJob" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"ownerId" text NOT NULL,
	"status" text NOT NULL,
	"total" integer NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"succeeded" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"itemsJson" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"finishedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "ChangeItem" (
	"id" text PRIMARY KEY NOT NULL,
	"changeSetId" text NOT NULL,
	"resourceType" text NOT NULL,
	"resourceId" text NOT NULL,
	"beforeJson" text,
	"afterJson" text,
	"status" text DEFAULT 'done' NOT NULL,
	"error" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChangeSet" (
	"id" text PRIMARY KEY NOT NULL,
	"ownerId" text NOT NULL,
	"accountId" text,
	"zoneId" text,
	"action" text NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"reversible" boolean DEFAULT false NOT NULL,
	"jobId" text,
	"metaJson" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"finishedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "CloudflareAccount" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"label" text,
	"authType" text DEFAULT 'globalApiKey' NOT NULL,
	"email" text,
	"credentialEncrypted" text NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DnsTemplate" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"recordsJson" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Domain" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"name" text NOT NULL,
	"zoneId" text,
	"status" text DEFAULT 'active',
	"settingsJson" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "InviteCode" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"note" text,
	"maxUses" integer DEFAULT 1 NOT NULL,
	"usedCount" integer DEFAULT 0 NOT NULL,
	"usedByJson" text DEFAULT '[]' NOT NULL,
	"expiresAt" timestamp (3),
	"createdBy" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "InviteCode_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"jti" text NOT NULL,
	"userAgent" text,
	"ip" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp (3) DEFAULT now() NOT NULL,
	"revokedAt" timestamp (3),
	CONSTRAINT "Session_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
CREATE TABLE "TagRule" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"field" text NOT NULL,
	"op" text NOT NULL,
	"value" text NOT NULL,
	"tag" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Tag" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"templateId" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"passwordHash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"displayName" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ChangeItem" ADD CONSTRAINT "ChangeItem_changeSetId_ChangeSet_id_fk" FOREIGN KEY ("changeSetId") REFERENCES "public"."ChangeSet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CloudflareAccount" ADD CONSTRAINT "CloudflareAccount_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "DnsTemplate" ADD CONSTRAINT "DnsTemplate_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_accountId_CloudflareAccount_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."CloudflareAccount"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TagRule" ADD CONSTRAINT "TagRule_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "BulkJob_ownerId_createdAt_idx" ON "BulkJob" USING btree ("ownerId","createdAt");--> statement-breakpoint
CREATE INDEX "ChangeItem_changeSetId_idx" ON "ChangeItem" USING btree ("changeSetId");--> statement-breakpoint
CREATE INDEX "ChangeSet_ownerId_createdAt_idx" ON "ChangeSet" USING btree ("ownerId","createdAt");--> statement-breakpoint
CREATE INDEX "ChangeSet_zoneId_createdAt_idx" ON "ChangeSet" USING btree ("zoneId","createdAt");--> statement-breakpoint
CREATE INDEX "ChangeSet_accountId_createdAt_idx" ON "ChangeSet" USING btree ("accountId","createdAt");--> statement-breakpoint
CREATE INDEX "CloudflareAccount_userId_idx" ON "CloudflareAccount" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "DnsTemplate_userId_idx" ON "DnsTemplate" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Domain_accountId_idx" ON "Domain" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX "Session_userId_idx" ON "Session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "TagRule_userId_idx" ON "TagRule" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag" USING btree ("userId","name");