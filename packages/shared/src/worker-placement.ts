import { z } from "zod";

export const WORKER_PLACEMENT_MODE_SMART = "smart" as const;
export const WORKER_PLACEMENT_MODE_REGION = "region" as const;

export const WorkerPlacementModeSchema = z.enum([
  WORKER_PLACEMENT_MODE_SMART,
  WORKER_PLACEMENT_MODE_REGION,
]);
export type WorkerPlacementMode = z.infer<typeof WorkerPlacementModeSchema>;

/** Cloudflare placement.region values offered in Admin Settings (US West first). */
export const WORKER_PLACEMENT_REGION_OPTIONS = [
  { id: "aws:us-west-2", label: "US West — AWS Oregon (recommended)" },
  { id: "aws:us-west-1", label: "US West — AWS N. California" },
  { id: "gcp:us-west1", label: "US West — GCP Oregon" },
  { id: "gcp:us-west4", label: "US West — GCP Las Vegas" },
  { id: "azure:westus2", label: "US West — Azure Washington" },
  { id: "azure:westus3", label: "US West — Azure Arizona" },
  { id: "aws:us-east-1", label: "US East — AWS Virginia" },
  { id: "gcp:us-east4", label: "US East — GCP Virginia" },
] as const;

export const DEFAULT_WORKER_PLACEMENT_REGION = "aws:us-west-2" as const;

const regionIds = new Set<string>(
  WORKER_PLACEMENT_REGION_OPTIONS.map((option) => option.id),
);

export const WorkerPlacementRegionSchema = z
  .string()
  .min(1)
  .refine((value) => regionIds.has(value), "Unsupported placement region");

export type WorkerPlacementSetting = {
  mode: WorkerPlacementMode;
  region: string | null;
};

export type CloudflareWorkerPlacementMetadata =
  | { mode: "smart" }
  | { region: string };

export function normalizeWorkerPlacementSetting(
  input?: Partial<WorkerPlacementSetting> | null,
): WorkerPlacementSetting {
  const mode =
    input?.mode === WORKER_PLACEMENT_MODE_REGION
      ? WORKER_PLACEMENT_MODE_REGION
      : WORKER_PLACEMENT_MODE_SMART;
  if (mode === WORKER_PLACEMENT_MODE_REGION) {
    const region = input?.region?.trim();
    return {
      mode,
      region: region && regionIds.has(region) ? region : DEFAULT_WORKER_PLACEMENT_REGION,
    };
  }
  return { mode: WORKER_PLACEMENT_MODE_SMART, region: null };
}

export function toCloudflareWorkerPlacementMetadata(
  setting: WorkerPlacementSetting,
): CloudflareWorkerPlacementMetadata {
  if (setting.mode === WORKER_PLACEMENT_MODE_REGION) {
    return { region: setting.region ?? DEFAULT_WORKER_PLACEMENT_REGION };
  }
  return { mode: "smart" };
}

export function workerPlacementSettingFromOrgRow(row: {
  cloudflareWorkerPlacementMode?: string | null;
  cloudflareWorkerPlacementRegion?: string | null;
}): WorkerPlacementSetting {
  return normalizeWorkerPlacementSetting({
    mode:
      row.cloudflareWorkerPlacementMode === WORKER_PLACEMENT_MODE_REGION
        ? WORKER_PLACEMENT_MODE_REGION
        : WORKER_PLACEMENT_MODE_SMART,
    region: row.cloudflareWorkerPlacementRegion,
  });
}

export const WorkerPlacementPatchSchema = z
  .object({
    workerPlacementMode: WorkerPlacementModeSchema,
    workerPlacementRegion: WorkerPlacementRegionSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.workerPlacementMode === WORKER_PLACEMENT_MODE_REGION && !data.workerPlacementRegion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a region when using fixed region placement",
        path: ["workerPlacementRegion"],
      });
    }
  });
