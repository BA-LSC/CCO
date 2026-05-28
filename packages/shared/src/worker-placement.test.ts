import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WORKER_PLACEMENT_REGION,
  normalizeWorkerPlacementSetting,
  toCloudflareWorkerPlacementMetadata,
  WorkerPlacementPatchSchema,
  WORKER_PLACEMENT_MODE_REGION,
  WORKER_PLACEMENT_MODE_SMART,
} from "./worker-placement";

describe("worker placement", () => {
  test("defaults to smart placement", () => {
    expect(normalizeWorkerPlacementSetting(null)).toEqual({
      mode: WORKER_PLACEMENT_MODE_SMART,
      region: null,
    });
    expect(toCloudflareWorkerPlacementMetadata(normalizeWorkerPlacementSetting(null))).toEqual({
      mode: "smart",
    });
  });

  test("region mode uses default west when region missing", () => {
    const setting = normalizeWorkerPlacementSetting({ mode: WORKER_PLACEMENT_MODE_REGION });
    expect(setting.region).toBe(DEFAULT_WORKER_PLACEMENT_REGION);
    expect(toCloudflareWorkerPlacementMetadata(setting)).toEqual({
      region: DEFAULT_WORKER_PLACEMENT_REGION,
    });
  });

  test("patch schema requires region when mode is region", () => {
    const parsed = WorkerPlacementPatchSchema.safeParse({
      workerPlacementMode: WORKER_PLACEMENT_MODE_REGION,
    });
    expect(parsed.success).toBe(false);
  });
});
