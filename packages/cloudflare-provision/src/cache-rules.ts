import { cfRequest, CloudflareApiError } from "./cloudflare-api";

export const R2_ATTACHMENT_CACHE_RULE_DESCRIPTION = "cco-r2-presigned-url-cache";

type RulesetRule = {
  id?: string;
  description?: string;
  expression: string;
  action: string;
  action_parameters?: Record<string, unknown>;
  enabled?: boolean;
};

type Ruleset = {
  id: string;
  name?: string;
  phase?: string;
  rules?: RulesetRule[];
};

const PRESIGNED_URL_EXPRESSION = 'http.request.uri.query contains "X-Amz-Signature"';

function buildR2CacheRule(): RulesetRule {
  return {
    description: R2_ATTACHMENT_CACHE_RULE_DESCRIPTION,
    expression: PRESIGNED_URL_EXPRESSION,
    action: "set_cache_settings",
    action_parameters: {
      cache: true,
      edge_ttl: {
        mode: "respect_origin",
      },
    },
    enabled: true,
  };
}

async function getCacheSettingsEntrypoint(
  zoneId: string,
  apiToken: string,
): Promise<Ruleset | null> {
  try {
    return await cfRequest<Ruleset>(
      apiToken,
      `/zones/${zoneId}/rulesets/phases/http_request_cache_settings/entrypoint`,
    );
  } catch (err) {
    if (err instanceof CloudflareApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

async function getRuleset(zoneId: string, apiToken: string, rulesetId: string): Promise<Ruleset> {
  return cfRequest<Ruleset>(apiToken, `/zones/${zoneId}/rulesets/${rulesetId}`);
}

/**
 * Ensures a zone cache rule that caches presigned R2 GET URLs (query contains X-Amz-Signature).
 * Uses the http_request_cache_settings ruleset phase.
 */
export async function ensureR2AttachmentCacheRule(
  zoneId: string,
  apiToken: string,
): Promise<{ created: boolean; rulesetId: string }> {
  const desiredRule = buildR2CacheRule();
  const entrypoint = await getCacheSettingsEntrypoint(zoneId, apiToken);

  if (!entrypoint?.id) {
    const created = await cfRequest<Ruleset>(apiToken, `/zones/${zoneId}/rulesets`, {
      method: "POST",
      body: JSON.stringify({
        name: "CCO R2 attachment cache",
        kind: "zone",
        phase: "http_request_cache_settings",
        rules: [desiredRule],
      }),
    });
    return { created: true, rulesetId: created.id };
  }

  const ruleset = await getRuleset(zoneId, apiToken, entrypoint.id);
  const rules = ruleset.rules ?? [];
  const existing = rules.find((rule) => rule.description === R2_ATTACHMENT_CACHE_RULE_DESCRIPTION);
  if (existing) {
    return { created: false, rulesetId: entrypoint.id };
  }

  await cfRequest<Ruleset>(apiToken, `/zones/${zoneId}/rulesets/${entrypoint.id}`, {
    method: "PUT",
    body: JSON.stringify({
      rules: [...rules, desiredRule],
    }),
  });

  return { created: true, rulesetId: entrypoint.id };
}
