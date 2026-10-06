import "./styles.css";
import browser from "webextension-polyfill";
import { MigaduConfig, MigaduStorage } from "./types";
import { createIcons, AtSign, Coffee } from "lucide";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
};

const userEl = $<HTMLInputElement>("user");
const tokenEl = $<HTMLInputElement>("token");
const domainEl = $<HTMLInputElement>("domain");
const domainsEl = $<HTMLTextAreaElement>("domains");
const defaultAliasDomainEl = $<HTMLSelectElement>("defaultAliasDomain");
const saveEl = $<HTMLButtonElement>("save");
const statusEl = $<HTMLElement>("status");

function setFormDisabled(disabled: boolean): void {
  for (const element of [userEl, tokenEl, domainEl, domainsEl, defaultAliasDomainEl, saveEl]) {
    element.disabled = disabled;
  }
}

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

  domainsEl.value = aliasDomains.join("\n");
  domainEl.value = legacyDomain ?? aliasDomains[0] ?? "";

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

domainsEl.addEventListener("input", () => {
  const domains = parseDomains(domainsEl.value);
  const selected = defaultAliasDomainEl.value.trim() || null;
  const safeSelected = selected && domains.includes(selected) ? selected : null;
  renderDefaultDomainOptions(domains, safeSelected);
});

async function initialize(): Promise<void> {
  setFormDisabled(true);
  statusEl.textContent = "Loading settings…";
  try {
    await load();
    statusEl.textContent = "—";
    setFormDisabled(false);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    statusEl.textContent = `Could not load settings: ${message}. Reload this page to retry.`;
  }
}

void initialize();

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
