import "./styles.css";
import browser from "webextension-polyfill";
import { hasApiAccess, listDomains, requestApiAccess } from "./migadu";
import { MigaduConfig, MigaduDomain, MigaduStorage } from "./types";
import { createIcons, AtSign, Coffee, RefreshCw } from "lucide";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
};

const userEl = $<HTMLInputElement>("user");
const tokenEl = $<HTMLInputElement>("token");
const domainEl = $<HTMLSelectElement>("domain");
const fetchDomainsEl = $<HTMLButtonElement>("fetchDomains");
const domainCacheInfoEl = $<HTMLElement>("domainCacheInfo");
const domainsEl = $<HTMLTextAreaElement>("domains");
const defaultAliasDomainEl = $<HTMLSelectElement>("defaultAliasDomain");
const saveEl = $<HTMLButtonElement>("save");
const statusEl = $<HTMLElement>("status");
const apiAccessEl = $<HTMLElement>("apiAccess");
const allowApiAccessEl = $<HTMLButtonElement>("allowApiAccess");

let fetchedDomains: MigaduDomain[] = [];

function setFormDisabled(disabled: boolean): void {
  for (const element of [
    userEl,
    tokenEl,
    domainEl,
    domainsEl,
    defaultAliasDomainEl,
    saveEl,
    fetchDomainsEl,
  ]) {
    element.disabled = disabled;
  }
}

createIcons({
  icons: {
    AtSign,
    Coffee,
    RefreshCw,
  },
});

function parseDomains(raw: string): string[] {
  const parts = raw
    .split(/[\n,]+/)
    .map((d) => d.trim())
    .filter(Boolean);

  return Array.from(new Set(parts));
}

function domainLabel(domain: MigaduDomain): string {
  return domain.state && domain.state !== "active"
    ? `${domain.name} (${domain.state})`
    : domain.name;
}

function isFetched(name: string): boolean {
  return fetchedDomains.some((d) => d.name === name);
}

function renderApiDomainOptions(selected: string): void {
  domainEl.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = fetchedDomains.length ? "— Select a domain —" : "— Fetch domains —";
  domainEl.append(placeholder);

  const options = fetchedDomains.map((d) => ({ value: d.name, label: domainLabel(d) }));
  if (selected && !isFetched(selected)) {
    options.unshift({
      value: selected,
      label: fetchedDomains.length ? `${selected} (not in Migadu list)` : selected,
    });
  }
  for (const { value, label } of options) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    domainEl.append(opt);
  }
  domainEl.value = selected;
}

function setFetchedDomains(domains: MigaduDomain[], at: number | null): void {
  const apiDomain = domainEl.value;
  fetchedDomains = domains;
  domainCacheInfoEl.textContent =
    at === null
      ? "Enter your email and token, then press Fetch to load your domains."
      : `${domains.length} domains · cached ${new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(at))}`;
  renderApiDomainOptions(apiDomain || (domains.length === 1 ? domains[0].name : ""));
}

function refreshDefaultDomainOptions(): void {
  const domains = parseDomains(domainsEl.value);
  const selected = defaultAliasDomainEl.value.trim() || null;
  renderDefaultDomainOptions(domains, selected && domains.includes(selected) ? selected : null);
}

function renderDefaultDomainOptions(domains: string[], selected: string | null): void {
  defaultAliasDomainEl.innerHTML = "";

  const none = document.createElement("option");
  none.value = "";
  none.textContent = "— None —";
  defaultAliasDomainEl.appendChild(none);

  for (const domain of domains) {
    const opt = document.createElement("option");
    opt.value = domain;
    opt.textContent = domain;
    opt.selected = selected === domain;
    defaultAliasDomainEl.appendChild(opt);
  }

  if (!domains.includes(selected ?? "")) {
    defaultAliasDomainEl.value = "";
  }
}

async function load(): Promise<void> {
  const { migadu = {} } = (await browser.storage.local.get("migadu")) as MigaduStorage;
  const { aliasDomainSelection } = (await browser.storage.local.get(
    "aliasDomainSelection",
  )) as MigaduStorage;

  userEl.value = migadu.user ?? "";
  tokenEl.value = migadu.token ?? "";

  const legacyDomain = migadu.domain?.trim();
  const storedDomains = Array.isArray(migadu.domains) ? migadu.domains : [];
  const aliasDomains = Array.from(
    new Set(
      (migadu.domains === undefined && legacyDomain ? [legacyDomain] : storedDomains)
        .map((d) => d.trim())
        .filter(Boolean),
    ),
  );

  const { domainCache } = (await browser.storage.local.get("domainCache")) as MigaduStorage;
  const cache =
    domainCache && domainCache.user === migadu.user?.trim() && Array.isArray(domainCache.domains)
      ? domainCache
      : null;
  domainsEl.value = aliasDomains.join("\n");
  setFetchedDomains(cache?.domains ?? [], cache?.at ?? null);
  renderApiDomainOptions(legacyDomain ?? aliasDomains[0] ?? "");

  const configuredDefaultAliasDomain =
    migadu.defaultAliasDomain && aliasDomains.includes(migadu.defaultAliasDomain)
      ? migadu.defaultAliasDomain
      : null;
  const defaultAliasDomain =
    aliasDomainSelection?.user === migadu.user?.trim() &&
    aliasDomainSelection?.domain === domainEl.value &&
    (aliasDomainSelection.value === null || aliasDomains.includes(aliasDomainSelection.value))
      ? aliasDomainSelection.value
      : configuredDefaultAliasDomain;
  renderDefaultDomainOptions(aliasDomains, defaultAliasDomain);
}

domainsEl.addEventListener("input", refreshDefaultDomainOptions);

fetchDomainsEl.addEventListener("click", async (): Promise<void> => {
  if (fetchDomainsEl.disabled) return;
  const user = userEl.value.trim();
  const token = tokenEl.value.trim();
  if (!user || !token) {
    statusEl.textContent = "Enter your email and API token before fetching domains.";
    return;
  }
  // Must be requested before any await so the browser still sees the click as a user gesture.
  const access = apiAccessEl.classList.contains("hidden") ? null : requestApiAccess();
  setFormDisabled(true);
  try {
    if (access) apiAccessEl.classList.toggle("hidden", await access);
    statusEl.textContent = "Fetching domains…";
    const domains = await listDomains(user, token);
    const at = Date.now();
    let warning = "";
    try {
      await browser.storage.local.set({ domainCache: { user, at, domains } });
    } catch (e) {
      warning = ` Cache could not be saved: ${e instanceof Error ? e.message : String(e)}.`;
    }
    setFetchedDomains(domains, at);
    statusEl.textContent = `OK · ${domains.length} domains. Remember to save.${warning}`;
  } catch (e) {
    statusEl.textContent = e instanceof Error ? e.message : String(e);
  } finally {
    setFormDisabled(false);
  }
});

async function initialize(): Promise<void> {
  setFormDisabled(true);
  statusEl.textContent = "Loading settings…";
  try {
    await load();
    apiAccessEl.classList.toggle("hidden", await hasApiAccess());
    statusEl.textContent = "—";
    setFormDisabled(false);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    statusEl.textContent = `Could not load settings: ${message}. Reload this page to retry.`;
  }
}

void initialize();

allowApiAccessEl.addEventListener("click", async (): Promise<void> => {
  try {
    const granted = await requestApiAccess();
    apiAccessEl.classList.toggle("hidden", granted);
    statusEl.textContent = granted
      ? "Access to api.migadu.com allowed."
      : "Access to api.migadu.com was not allowed.";
  } catch (e) {
    statusEl.textContent = e instanceof Error ? e.message : String(e);
  }
});

saveEl.addEventListener("click", async (): Promise<void> => {
  if (saveEl.disabled) return;
  setFormDisabled(true);
  try {
    const domains = parseDomains(domainsEl.value);
    const defaultAliasDomain = defaultAliasDomainEl.value.trim() || null;
    const domain = domainEl.value.trim();
    const user = userEl.value.trim();
    const token = tokenEl.value.trim();

    if (!user) {
      throw new Error("Email (API user) is required.");
    }
    userEl.value = user;
    if (userEl.validity.typeMismatch) {
      throw new Error("Email (API user) must be a valid email address.");
    }
    if (!token) {
      throw new Error("API key / token is required.");
    }
    if (!domain) {
      throw new Error("Domain is required for Migadu API calls.");
    }
    if (defaultAliasDomain && !domains.includes(defaultAliasDomain)) {
      throw new Error("Default alias domain must be included in domains.");
    }

    const migadu: MigaduConfig = {
      user,
      token,
      domain,
      domains,
      defaultAliasDomain,
    };

    statusEl.textContent = "Saving settings…";
    await browser.storage.local.set({ migadu, aliasDomainSelection: null });
    statusEl.textContent = "Save OK";
    renderDefaultDomainOptions(domains, defaultAliasDomain);
  } catch (e) {
    statusEl.textContent = e instanceof Error ? e.message : String(e);
  } finally {
    setFormDisabled(false);
  }
});
