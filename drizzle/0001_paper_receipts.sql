CREATE TABLE "paper_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"month" text NOT NULL,
	"no" integer NOT NULL,
	"payload" "bytea" NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "source" text DEFAULT 'uke' NOT NULL;--> statement-breakpoint
ALTER TABLE "paper_receipts" ADD CONSTRAINT "paper_receipts_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paper_receipts_clinic_month_idx" ON "paper_receipts" USING btree ("clinic_id","month");