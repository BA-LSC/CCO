import { runWithWorkerContext } from "../../../services/api/src/runtime/worker-context";
import { createApp } from "./app";
import { workerBindings, workerEnvVars, type CcoApiEnv } from "./env";

const app = createApp();

export default {
  async fetch(request: Request, env: CcoApiEnv, _ctx: ExecutionContext): Promise<Response> {
    return runWithWorkerContext(workerBindings(env), workerEnvVars(env), () => app.fetch(request));
  },
};

export { createApp };
export type { CcoApiEnv };
