CREATE TABLE "ai_usage" (
	"clinic_id" text NOT NULL,
	"month" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_clinic_id_month_pk" PRIMARY KEY("clinic_id","month")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"clinic_id" text,
	"user_id" text,
	"user_email" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_history" (
	"clinic_id" text PRIMARY KEY NOT NULL,
	"rows" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_rule_settings" (
	"clinic_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"enabled" boolean,
	"priority" integer,
	"history_count" integer,
	CONSTRAINT "clinic_rule_settings_clinic_id_rule_id_pk" PRIMARY KEY("clinic_id","rule_id")
);
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"facility_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"require_2fa" boolean DEFAULT false NOT NULL,
	"retention_months" integer DEFAULT 13 NOT NULL,
	"salt" text NOT NULL,
	"ai_monthly_limit" integer DEFAULT 300 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"run_id" text NOT NULL,
	"id" text NOT NULL,
	"clinic_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"ai_explanation" text DEFAULT '' NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "findings_run_id_id_pk" PRIMARY KEY("run_id","id")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "masters" (
	"kind" text PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"row_count" integer NOT NULL,
	"data" jsonb NOT NULL,
	"imported_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "month_receipts" (
	"clinic_id" text NOT NULL,
	"month" text NOT NULL,
	"receipt_count" integer NOT NULL,
	"payload" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "month_receipts_clinic_id_month_pk" PRIMARY KEY("clinic_id","month")
);
--> statement-breakpoint
CREATE TABLE "rule_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"target_month" text NOT NULL,
	"clinic_name" text NOT NULL,
	"history_months" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"warnings" jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pending_2fa" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"clinic_id" text,
	"user_id" text,
	"role" text,
	"email" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"disabled" boolean DEFAULT false NOT NULL,
	"terms_accepted_at" timestamp with time zone,
	"terms_version" text,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_history" ADD CONSTRAINT "claim_history_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_rule_settings" ADD CONSTRAINT "clinic_rule_settings_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_receipts" ADD CONSTRAINT "month_receipts_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_clinic_idx" ON "audit_logs" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "findings_clinic_idx" ON "findings" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "rules_clinic_idx" ON "rules" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "runs_clinic_idx" ON "runs" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");