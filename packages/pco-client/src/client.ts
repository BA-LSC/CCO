import { PcoApiError } from "./errors";

const BASE_URL = "https://api.planningcenteronline.com";

export type PlanningCenterClientOptions = {
  accessToken: string;
};

type PcoPaginatedResponse<T> = {
  data: T[];
  links?: { next?: string | null };
};

const PCO_MAX_PER_PAGE = 100;

export class PlanningCenterClient {
  private requestTimes: number[] = [];

  constructor(private readonly options: PlanningCenterClientOptions) {}

  get configured(): boolean {
    return Boolean(this.options.accessToken);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  /** Follow offset pagination until a PCO collection is fully loaded. */
  async getAllPages<T>(path: string): Promise<T[]> {
    const results: T[] = [];
    let offset = 0;

    for (;;) {
      const separator = path.includes("?") ? "&" : "?";
      const page = await this.get<PcoPaginatedResponse<T>>(
        `${path}${separator}per_page=${PCO_MAX_PER_PAGE}&offset=${offset}`,
      );
      const batch = page.data ?? [];
      results.push(...batch);
      if (batch.length < PCO_MAX_PER_PAGE && !page.links?.next) break;
      offset += PCO_MAX_PER_PAGE;
      if (batch.length === 0) break;
    }

    return results;
  }

  async delete(path: string): Promise<void> {
    await this.request<void>("DELETE", path);
  }

  private async request<T>(method: string, path: string): Promise<T> {
    if (!this.configured) {
      throw new Error("Planning Center client is not configured");
    }
    await this.throttle();
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.options.accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new PcoApiError(res.status, await res.text());
    }
    if (res.status === 204 || method === "DELETE") {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter((t) => now - t < 60_000);
    if (this.requestTimes.length >= 95) {
      const waitMs = 60_000 - (now - this.requestTimes[0]) + 50;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.requestTimes.push(Date.now());
  }
}
