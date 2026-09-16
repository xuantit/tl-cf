CREATE TABLE "RegistrationMailQuota" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expiresAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "PendingRegistration" ADD COLUMN "tokenEncrypted" text;--> statement-breakpoint
CREATE INDEX "RegistrationMailQuota_expiresAt_idx" ON "RegistrationMailQuota" USING btree ("expiresAt");