import browser from "webextension-polyfill";
import { CreateAliasInput, MigaduAlias, MigaduConfig, MigaduStorage } from "./types";

const API_BASE = "https://api.migadu.com/v1";

type MigaduAliasRaw = Omit<MigaduAlias, "is_internal"> & {
  is_internal?: boolean | "true" | "false";
};

export async function getConfigOrThrow(): Promise<MigaduConfig> {
  const { migadu } = (await browser.storage.local.get("migadu")) as MigaduStorage;

  const user = migadu?.user?.trim();
  const token = migadu?.token?.trim();
  const aliasDomains = Array.isArray(migadu?.domains)
    ? migadu.domains.map((d) => d.trim()).filter(Boolean)
    : [];
  const defaultAliasDomain =
    migadu?.defaultAliasDomain && aliasDomains.includes(migadu.defaultAliasDomain)
      ? migadu.defaultAliasDomain
      : null;
  const domain = migadu?.domain?.trim() ?? (aliasDomains.length > 0 ? aliasDomains[0] : undefined);

  if (!user || !token || !domain) {
    throw new Error("Missing configuration. Open Options and add your user, API token and domain.");
  }

  return { user, token, domain, domains: aliasDomains, defaultAliasDomain };
}

function basicAuthHeader(user: string, token: string): string {
  // Basic base64("user:token")
  return `Basic ${btoa(`${user}:${token}`)}`;
}

async function assertOk(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  throw new Error(`${label}: HTTP ${res.status}${body ? ` (${body})` : ""}`);
}

export async function listAliases(): Promise<MigaduAlias[]> {
  const { user, token, domain } = await getConfigOrThrow();

  const res = await fetch(`${API_BASE}/domains/${encodeURIComponent(domain)}/aliases`, {
    headers: { Authorization: basicAuthHeader(user, token) },
  });

  const data = (await res.json()) as { address_aliases?: MigaduAliasRaw[] };
  return (data.address_aliases ?? []).map(normalizeAlias);
}

function normalizeAlias(raw: MigaduAliasRaw): MigaduAlias {
  return {
    address: raw.address,
    local_part: raw.local_part,
    destinations: Array.isArray(raw.destinations) ? raw.destinations : [],
    is_internal: typeof raw.is_internal === "string" ? raw.is_internal === "true" : raw.is_internal,
  };
}

export async function createAlias(input: CreateAliasInput): Promise<MigaduAlias> {
  const { user, token, domain } = await getConfigOrThrow();

  const res = await fetch(`${API_BASE}/domains/${encodeURIComponent(domain)}/aliases`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(user, token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      local_part: input.localPart,
      destinations: input.destinationsCsv,
      is_internal: input.isInternal ? "true" : "false",
    }),
  });

  await assertOk(res, "Create alias failed");

  const raw = (await res.json()) as MigaduAliasRaw;
  return normalizeAlias(raw);
}

export async function deleteAlias(localPart: string): Promise<void> {
  const { user, token, domain } = await getConfigOrThrow();

  const res = await fetch(
    `${API_BASE}/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(localPart)}`,
    {
      method: "DELETE",
      headers: { Authorization: basicAuthHeader(user, token) },
    },
  );

  await assertOk(res, "Delete alias failed");
}
