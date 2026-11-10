ALTER TABLE "eventos"."pessoa_evento" ADD COLUMN "polo_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."pessoa_evento" ADD COLUMN "cep" text;--> statement-breakpoint
ALTER TABLE "eventos"."pessoa_evento" ADD COLUMN "cidade" text;--> statement-breakpoint
ALTER TABLE "eventos"."pessoa_evento" ADD COLUMN "uf" text;--> statement-breakpoint
ALTER TABLE "eventos"."pessoa_evento" ADD CONSTRAINT "pessoa_evento_polo_id_polo_id_fk" FOREIGN KEY ("polo_id") REFERENCES "core"."polo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pessoa_evento_polo_idx" ON "eventos"."pessoa_evento" USING btree ("polo_id");--> statement-breakpoint
ALTER TABLE "eventos"."pessoa_evento" ADD CONSTRAINT "pessoa_evento_cep_check" CHECK ("eventos"."pessoa_evento"."cep" IS NULL OR "eventos"."pessoa_evento"."cep" ~ '^[0-9]{8}$');--> statement-breakpoint
ALTER TABLE "eventos"."pessoa_evento" ADD CONSTRAINT "pessoa_evento_uf_check" CHECK ("eventos"."pessoa_evento"."uf" IS NULL OR "eventos"."pessoa_evento"."uf" ~ '^[A-Z]{2}$');