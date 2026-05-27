import { preloadWorkerEnvVars, runWithWorkerContext } from "../../../services/api/src/runtime/worker-context";
import { createApp } from "./app";
import { workerBindings, type CcoApiEnv } from "./env";

const app = createApp();

export default {
  async fetch(request: Request, env: CcoApiEnv, ctx: ExecutionContext): Promise<Response> {
    const vars = await preloadWorkerEnvVars(env);
    return runWithWorkerContext(workerBindings(env), vars, () => app.fetch(request), ctx);
  },
};

export { createApp };
export type { CcoApiEnv };
