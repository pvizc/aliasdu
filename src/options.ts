import "./styles.css";
import { MigaduConfig, MigaduStorage } from "./types";
import { createIcons, AtSign, Coffee } from "lucide";

console.log("[options] loaded");

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
};

const userEl = $<HTMLInputElement>("user");
const tokenEl = $<HTMLInputElement>("token");
const domainsEl = $<HTMLTextAreaElement>("domains");
const defaultAliasDomainEl = $<HTMLSelectElement>("defaultAliasDomain");
const saveEl = $<HTMLButtonElement>("save");
const statusEl = $<HTMLElement>("status");

createIcons({
  icons: {
    AtSign,
    Coffee,
  },
});

function parseDomains(raw: string): string[] {
  const parts = raw
    .split(/[\n,]+/)
    .map((d) => d.trim())
    .filter(Boolean);

  return Array.from(new Set(parts));
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
  const { migadu = {} } = (await chrome.storage.local.get("migadu")) as MigaduStorage;

  userEl.value = migadu.user ?? "";
  tokenEl.value = migadu.token ?? "";

  const legacyDomain = migadu.domain?.trim();
  const storedDomains = Array.isArray(migadu.domains) ? migadu.domains : [];
  const domains = Array.from(new Set([...storedDomains, legacyDomain].filter(Boolean) as string[]));

  domainsEl.value = domains.join("\n");

  const defaultAliasDomain =
    migadu.defaultAliasDomain && domains.includes(migadu.defaultAliasDomain)
      ? migadu.defaultAliasDomain
      : null;
  renderDefaultDomainOptions(domains, defaultAliasDomain);
}

domainsEl.addEventListener("input", () => {
  const domains = parseDomains(domainsEl.value);
  const selected = defaultAliasDomainEl.value.trim() || null;
  const safeSelected = selected && domains.includes(selected) ? selected : null;
  renderDefaultDomainOptions(domains, safeSelected);
});

void load();

saveEl.addEventListener("click", async (): Promise<void> => {
  try {
    const domains = parseDomains(domainsEl.value);
    const defaultAliasDomain = defaultAliasDomainEl.value.trim() || null;

    if (defaultAliasDomain && !domains.includes(defaultAliasDomain)) {
      throw new Error("Default alias domain must be included in domains.");
    }

    const domainForLegacy = defaultAliasDomain ?? domains[0] ?? "";
    const migadu: MigaduConfig = {
      user: userEl.value.trim(),
      token: tokenEl.value.trim(),
      domain: domainForLegacy,
      domains,
      defaultAliasDomain,
    };

    await chrome.storage.local.set({ migadu });
    statusEl.textContent = "Guardado ✅";
    renderDefaultDomainOptions(domains, defaultAliasDomain);
  } catch (e) {
    statusEl.textContent = e instanceof Error ? e.message : String(e);
  }
});
