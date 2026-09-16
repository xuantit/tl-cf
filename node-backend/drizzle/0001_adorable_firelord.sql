CREATE TABLE "PendingRegistration" (
	"email" text PRIMARY KEY NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"requestedAt" timestamp (3) NOT NULL,
	CONSTRAINT "PendingRegistration_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE INDEX "PendingRegistration_expiresAt_idx" ON "PendingRegistration" USING btree ("expiresAt");