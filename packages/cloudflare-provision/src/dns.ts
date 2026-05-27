import { cfRequest } from "./cloudflare-api";

export type DnsRecordType = "CNAME" | "AAAA" | "A";

export type EnsureDnsRecordParams = {
  type: DnsRecordType;
  name: string;
  content: string;
  proxied: true;
};

export type DnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
};

export async function listDnsRecords(
  zoneId: string,
  apiToken: string,
  params: { type?: DnsRecordType; name?: string },
): Promise<DnsRecord[]> {
  const search = new URLSearchParams();
  if (params.type) search.set("type", params.type);
  if (params.name) search.set("name", params.name);
  const query = search.toString();
  const result = await cfRequest<DnsRecord[]>(
    apiToken,
    `/zones/${zoneId}/dns_records${query ? `?${query}` : ""}`,
  );
  return result ?? [];
}

export async function createDnsRecord(
  zoneId: string,
  apiToken: string,
  params: EnsureDnsRecordParams,
): Promise<DnsRecord> {
  return cfRequest<DnsRecord>(apiToken, `/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: params.type,
      name: params.name,
      content: params.content,
      proxied: params.proxied,
    }),
  });
}

export async function updateDnsRecord(
  zoneId: string,
  apiToken: string,
  recordId: string,
  params: EnsureDnsRecordParams,
): Promise<DnsRecord> {
  return cfRequest<DnsRecord>(apiToken, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: "PUT",
    body: JSON.stringify({
      type: params.type,
      name: params.name,
      content: params.content,
      proxied: params.proxied,
    }),
  });
}

export async function deleteDnsRecord(
  zoneId: string,
  apiToken: string,
  recordId: string,
): Promise<void> {
  await cfRequest(apiToken, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: "DELETE",
  });
}

export async function ensureDnsRecord(
  zoneId: string,
  apiToken: string,
  params: EnsureDnsRecordParams,
): Promise<{ id: string; created: boolean }> {
  const existingForName = await listDnsRecords(zoneId, apiToken, { name: params.name });
  const sameType = existingForName.find((record) => record.type === params.type);
  if (sameType) {
    if (sameType.content !== params.content || sameType.proxied !== params.proxied) {
      await updateDnsRecord(zoneId, apiToken, sameType.id, params);
    }
    for (const record of existingForName) {
      if (record.id !== sameType.id) {
        await deleteDnsRecord(zoneId, apiToken, record.id);
      }
    }
    return { id: sameType.id, created: false };
  }

  for (const record of existingForName) {
    await deleteDnsRecord(zoneId, apiToken, record.id);
  }

  const created = await createDnsRecord(zoneId, apiToken, params);
  return { id: created.id, created: true };
}
