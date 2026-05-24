ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "realtime_kit_preset_host" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "realtime_kit_preset_member" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "realtime_kit_preset_guest" text;
