import type { ProvisionPipelineContext, ProvisionSessionState } from "./provision-pipeline";
import type { ProvisionStepHandler, ProvisionStepHandlers } from "./provision-pipeline";
import { deployAllProvisionWorkers, ensureCcoApiWorkerRoutes } from "./workers-deploy";
import type { CcoWorkerScriptName } from "./worker-definitions";

export type ProvisionWorkerBundleLoader = (
  scriptName: CcoWorkerScriptName,
) => Promise<ArrayBuffer>;

export type CreateProvisionWorkerHandlersOptions = {
  readBundle: ProvisionWorkerBundleLoader;
};

function requireProvisionContext(
  state: ProvisionSessionState,
  context: ProvisionPipelineContext,
): {
  accountId: string;
  apiHostname: string;
  secrets: NonNullable<ProvisionSessionState["secrets"]>;
} {
  const accountId = context.accountId ?? state.resources.accountId;
  const apiHostname = context.apiHostname ?? state.resources.apiHostname;
  const secrets = state.secrets;

  if (!accountId) throw new Error("Cloudflare account ID is required before deploying workers");
  if (!apiHostname) throw new Error("API hostname is required before deploying workers");
  if (!secrets) throw new Error("Provision secrets are required before deploying workers");

  return { accountId, apiHostname, secrets };
}

export async function createProvisionWorkerHandlers(
  options: CreateProvisionWorkerHandlersOptions,
): Promise<ProvisionStepHandlers> {
  const { readBundle } = options;

  const deployWorkersStep: ProvisionStepHandler = async (state, context) => {
    const { accountId, apiHostname, secrets } = requireProvisionContext(state, context);

    const required = [
      state.resources.d1DatabaseId,
      state.resources.r2BucketName,
      state.resources.kvPresenceNamespaceId,
      state.resources.kvDeployNamespaceId,
      state.resources.pushQueueId,
    ];
    if (required.some((value) => !value)) {
      throw new Error("D1, R2, KV, and queue resources must exist before deploy_workers");
    }

    const deployed = await deployAllProvisionWorkers({
      accountId,
      apiToken: context.apiToken,
      resources: state.resources,
      secrets,
      apiHostname,
      readBundle,
    });

    state.resources.workerScriptNames = deployed;
    state.resources.accountId = accountId;
    state.resources.apiHostname = apiHostname;
  };

  const configureRoutesStep: ProvisionStepHandler = async (state, context) => {
    const { apiHostname } = requireProvisionContext(state, context);
    const zoneId = context.zoneId ?? state.resources.zoneId;
    if (!zoneId) {
      throw new Error("Zone ID is required before configure_routes");
    }

    await ensureCcoApiWorkerRoutes(zoneId, context.apiToken, apiHostname);
    state.resources.zoneId = zoneId;
  };

  return {
    deploy_workers: deployWorkersStep,
    configure_routes: configureRoutesStep,
  };
}
