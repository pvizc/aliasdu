import "./styles.css";
import browser from "webextension-polyfill";
import { createAlias, deleteAlias, getConfigOrThrow, listAliases } from "./migadu";
import type { MigaduAlias, MigaduConfig, MigaduStorage } from "./types";
import { createIcons, AtSign, RefreshCw, CirclePlus } from "lucide";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
};

const searchEl = $<HTMLInputElement>("search");
let allAliases: MigaduAlias[] = [];
let activeConfig: MigaduConfig | null = null;
let busy = true;
let initializationFailed = false;

const statusEl = $<HTMLElement>("status");
const listEl = $<HTMLElement>("list");

const createBox = $<HTMLElement>("create");
const addBtn = $<HTMLButtonElement>("add");
const refreshBtn = $<HTMLButtonElement>("refresh");
const domainSelectorBtn = $<HTMLButtonElement>("domainSelector");
const domainMenuEl = $<HTMLDivElement>("domainMenu");
const domainSelectorLabelEl = $<HTMLElement>("domainSelectorLabel");
const createBtn = $<HTMLButtonElement>("createBtn");
const cancelBtn = $<HTMLButtonElement>("cancelBtn");
const confirmDeleteDialog = $<HTMLDialogElement>("confirmDeleteDialog");
const confirmDeleteBtn = $<HTMLButtonElement>("confirmDeleteBtn");
const cancelDeleteBtn = $<HTMLButtonElement>("cancelDeleteBtn");
const confirmDeleteAliasEl = $<HTMLElement>("confirmDeleteAlias");

const localPartEl = $<HTMLInputElement>("localPart");
const destinationsEl = $<HTMLInputElement>("destinations");
const isInternalEl = $<HTMLInputElement>("isInternal"); // checkbox

createIcons({
  icons: {
    AtSign,
    RefreshCw,
    CirclePlus,
  },
});

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

const missingConfigMessage =
  "Missing configuration. Open Options and add your user, API token and domain.";

function setControlAvailability(enabled: boolean): void {
  const canAct = enabled && !busy;
  refreshBtn.disabled = busy || (!enabled && !initializationFailed);
  addBtn.disabled = !canAct;
  searchEl.disabled = !canAct;
  createBtn.disabled = !canAct;
  confirmDeleteBtn.disabled = !canAct;
  cancelDeleteBtn.disabled = busy;
  cancelBtn.disabled = busy;
  localPartEl.disabled = !canAct;
  destinationsEl.disabled = !canAct;
  isInternalEl.disabled = !canAct;
  domainSelectorBtn.disabled = !canAct || availableDomains.length === 0;
  for (const button of listEl.querySelectorAll("button")) button.disabled = !canAct;

  refreshBtn.title = enabled ? "Refresh" : missingConfigMessage;
  addBtn.title = enabled ? "New alias" : missingConfigMessage;
  searchEl.placeholder = enabled ? "Search..." : "Configure Migadu to search aliases";

  if (!enabled) {
    createBox.classList.add("hidden");
  }
}

function renderMissingConfig(): void {
  activeConfig = null;
  allAliases = [];
  setControlAvailability(false);
  listEl.innerHTML = `
      <div class="border-l-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-800">
        ${missingConfigMessage}
      </div>`;
  setStatus("Missing configuration.");
}

function buildAliasToCopy(alias: MigaduAlias): string {
  const domain = defaultAliasDomain?.trim();
  const local = alias.local_part?.trim();
  const address = alias.address?.trim();

  if (domain && local) return `${local}@${domain}`;
  if (address) return address;
  if (local) return local;

  throw new Error("No alias data available to copy.");
}

async function copyAlias(
  alias: MigaduAlias,
  trigger?: HTMLButtonElement,
  reportStatus = true,
): Promise<string | null> {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable or permission denied.");
    }

    trigger && (trigger.disabled = true);
    const toCopy = buildAliasToCopy(alias);

    await navigator.clipboard.writeText(toCopy);
    if (reportStatus) setStatus(`Copied ${toCopy}`);
    return toCopy;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (reportStatus) setStatus(`Copy failed: ${message}`);
    return null;
  } finally {
    trigger && (trigger.disabled = false);
  }
}

function filterAliases(q: string, aliases: MigaduAlias[]): MigaduAlias[] {
  const query = q.trim().toLowerCase();
  if (!query) return aliases;

  return aliases.filter((a) => {
    const haystack =
      `${a.address} ${(a.destinations ?? []).join(", ")} ${a.local_part}`.toLowerCase();
    return haystack.includes(query);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

let availableDomains: string[] = [];
let defaultAliasDomain: string | null = null;

function updateDomainSelectorLabel(): void {
  const label = availableDomains.length === 0 ? "No alias domains" : (defaultAliasDomain ?? "None");
  domainSelectorLabelEl.textContent = label;
  domainSelectorBtn.disabled = busy || !activeConfig || availableDomains.length === 0;
  domainSelectorBtn.title =
    availableDomains.length === 0
      ? "Configure alias domains in Options"
      : "Select default alias domain";

  if (availableDomains.length === 0) {
    domainMenuEl.innerHTML =
      '<div class="px-3 py-2 text-xs text-slate-500">Configure alias domains in Options.</div>';
  }
}

function closeDomainMenu(): void {
  domainMenuEl.classList.add("hidden");
}

function renderDomainMenu(): void {
  domainMenuEl.innerHTML = "";

  if (availableDomains.length === 0) {
    domainMenuEl.innerHTML =
      '<div class="px-3 py-2 text-xs text-slate-500">Configure alias domains in Options.</div>';
    return;
  }

  const options: { label: string; value: string | null }[] = [
    { label: "None", value: null },
    ...availableDomains.map((d) => ({ label: d, value: d })),
  ];

  for (const { label, value } of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50";

    const labelEl = document.createElement("span");
    labelEl.textContent = label;

    const indicator = document.createElement("span");
    indicator.className = "text-xs font-semibold text-lime-600";
    indicator.textContent = value === defaultAliasDomain ? "✓" : "";

    btn.append(labelEl, indicator);

    btn.addEventListener("click", () => {
      closeDomainMenu();
      void setDefaultAliasDomain(value);
    });

    domainMenuEl.append(btn);
  }
}

function loadDomains(migadu: MigaduConfig): void {
  availableDomains = Array.from(new Set(migadu.domains));
  defaultAliasDomain =
    migadu.defaultAliasDomain && availableDomains.includes(migadu.defaultAliasDomain)
      ? migadu.defaultAliasDomain
      : null;

  updateDomainSelectorLabel();
  renderDomainMenu();
}

async function setDefaultAliasDomain(domain: string | null): Promise<void> {
  await runOperation(async (config) => {
    const normalized = domain && config.domains.includes(domain) ? domain : null;
    const migadu = { ...config, defaultAliasDomain: normalized };
    // Store the selection separately so it cannot overwrite credentials saved
    // concurrently in Options. Its scope also prevents reuse for another account.
    await browser.storage.local.set({
      aliasDomainSelection: { user: config.user, domain: config.domain, value: normalized },
    });
    if (!(await isCurrentConfig(config))) return;
    activeConfig = migadu;
    loadDomains(migadu);
    setStatus("Default alias domain saved.");
  });
}

function render(visible: MigaduAlias[], totalCount: number): void {
  listEl.innerHTML = "";

  if (totalCount === 0) {
    listEl.innerHTML = `
      <div class="border-l-2 border-lime-500 bg-slate-50/50 p-3 text-sm text-slate-600">
        Empty cache. Click <span class="font-semibold">↻</span> to fetch.
      </div>`;
    return;
  }

  if (visible.length === 0) {
    const q = searchEl.value.trim();
    listEl.innerHTML = `
      <div class="border-l-2 border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-600">
        No matches${q ? ` for <span class="font-semibold">"${escapeHtml(q)}"</span>` : ""}.
      </div>`;
    return;
  }

  for (const a of visible) {
    const row = document.createElement("div");
    row.className =
      "group flex items-start justify-between gap-3 border-l-2 border-transparent px-3 py-3 hover:border-lime-500 hover:bg-slate-50/60";

    const left = document.createElement("div");
    left.className = "min-w-0";

    const addr = document.createElement("div");
    addr.className = "truncate text-sm font-semibold text-slate-900";
    addr.textContent = a.address;

    const dest = document.createElement("div");
    dest.className = "mt-1 truncate text-xs text-slate-500";
    dest.textContent = (a.destinations ?? []).join(", ");

    left.append(addr, dest);

    const actions = document.createElement("div");
    actions.className = "mt-0.5 flex shrink-0 items-center gap-2";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className =
      "text-xs font-semibold text-slate-700 opacity-80 hover:opacity-100 group-hover:underline";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      if (!busy) void copyAlias(a, copyBtn);
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className =
      "mt-0.5 shrink-0 text-xs font-semibold text-rose-600 opacity-80 hover:opacity-100 group-hover:underline";
    del.textContent = "Delete";

    del.addEventListener("click", (event) => {
      event.stopPropagation();
      if (busy) return;

      confirmDeleteAliasEl.textContent = a.address ?? a.local_part;
      confirmDeleteBtn.dataset.localPart = a.local_part;
      confirmDeleteDialog.showModal();
    });

    actions.append(copyBtn, del);
    row.append(left, actions);
    row.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (busy || target?.closest("button")) return;

      void copyAlias(a);
    });
    listEl.appendChild(row);
  }
  setControlAvailability(Boolean(activeConfig));
}

function sameConfig(a: MigaduConfig, b: MigaduConfig): boolean {
  return a.user === b.user && a.domain === b.domain && a.token === b.token;
}

async function readCache(config: MigaduConfig): Promise<MigaduAlias[]> {
  const { aliasCache } = (await browser.storage.local.get("aliasCache")) as MigaduStorage;
  // Legacy caches have no account identity and cannot safely be reused.
  return aliasCache?.user === config.user && aliasCache.domain === config.domain
    ? aliasCache.aliases
    : [];
}

async function writeCache(config: MigaduConfig, aliases: MigaduAlias[]): Promise<void> {
  await browser.storage.local.set({
    aliasCache: { user: config.user, domain: config.domain, at: Date.now(), aliases },
  });
}

function resetConfig(config: MigaduConfig): void {
  activeConfig = config;
  allAliases = [];
  loadDomains(config);
  createBox.classList.add("hidden");
  confirmDeleteDialog.close();
  render([], 0);
}

async function isCurrentConfig(config: MigaduConfig): Promise<boolean> {
  const current = await getConfigOrThrow();
  if (sameConfig(current, config)) return true;
  resetConfig(current);
  setStatus("Configuration changed. Refresh to fetch aliases for the current account and domain.");
  return false;
}

async function commitAliases(
  config: MigaduConfig,
  aliases: MigaduAlias[],
  successMessage: string,
): Promise<boolean> {
  // A completed remote operation must never be reported as failed just because
  // local storage failed, or applied to another account after an Options edit.
  try {
    if (!(await isCurrentConfig(config))) {
      setStatus(`${successMessage} Configuration changed; refresh to view the current domain.`);
      return false;
    }
  } catch (e) {
    activeConfig = null;
    allAliases = [];
    render([], 0);
    initializationFailed = true;
    setStatus(
      `${successMessage} Could not verify configuration: ${errorMessage(e)}. Refresh to retry.`,
    );
    return false;
  }
  allAliases = aliases;
  const filtered = filterAliases(searchEl.value, allAliases);
  render(filtered, allAliases.length);
  let warning = "";
  try {
    await writeCache(config, aliases);
  } catch (e) {
    warning = ` Cache could not be saved: ${errorMessage(e)}. Refresh when reopening the popup.`;
    // Removing stale data can succeed even when a write fails (for example quota).
    await browser.storage.local.remove("aliasCache").catch(() => {});
  }
  setStatus(`${successMessage}${warning}`);
  return true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runOperation(
  action: (config: MigaduConfig) => Promise<void>,
  allowConfigChange = false,
): Promise<void> {
  if (busy) return;
  busy = true;
  setControlAvailability(Boolean(activeConfig));
  try {
    const config = await getConfigOrThrow();
    if (!activeConfig || !sameConfig(activeConfig, config)) {
      resetConfig(config);
      if (!allowConfigChange) {
        setStatus("Configuration changed. Refresh before creating or deleting aliases.");
        return;
      }
    }
    initializationFailed = false;
    loadDomains(config);
    await action(config);
  } catch (e) {
    if (errorMessage(e) === missingConfigMessage) renderMissingConfig();
    else setStatus(errorMessage(e));
  } finally {
    busy = false;
    setControlAvailability(Boolean(activeConfig));
  }
}

async function load(): Promise<void> {
  setControlAvailability(false);
  try {
    const config = await getConfigOrThrow();
    const aliases = await readCache(config);
    if (!(await isCurrentConfig(config))) return;
    activeConfig = config;
    loadDomains(config);
    allAliases = aliases;
    const filtered = filterAliases(searchEl.value, allAliases);
    render(filtered, allAliases.length);
    setStatus(
      aliases.length
        ? `Cache · ${filtered.length}/${aliases.length} aliases`
        : "Empty cache · press ↻",
    );
  } catch (e) {
    if (errorMessage(e) === missingConfigMessage) renderMissingConfig();
    else {
      initializationFailed = true;
      setStatus(`Initialization failed: ${errorMessage(e)}. Refresh to retry.`);
    }
  } finally {
    busy = false;
    setControlAvailability(Boolean(activeConfig));
  }
}

async function refresh(): Promise<void> {
  await runOperation(async (config) => {
    setStatus("Updating...");
    const aliases = await listAliases(config);
    await commitAliases(config, aliases, `OK · ${aliases.length} aliases.`);
  }, true);
}

refreshBtn.addEventListener("click", () => void refresh());

domainSelectorBtn.addEventListener("click", () => {
  if (domainSelectorBtn.disabled) return;
  domainMenuEl.classList.toggle("hidden");
});

document.addEventListener("click", (event) => {
  const target = event.target as Node;
  if (!domainMenuEl.contains(target) && !domainSelectorBtn.contains(target)) {
    closeDomainMenu();
  }
});

addBtn.addEventListener("click", () => {
  if (busy || !activeConfig) return;
  createBox.classList.toggle("hidden");
});

cancelBtn.addEventListener("click", () => {
  if (busy) return;
  createBox.classList.add("hidden");
});

confirmDeleteBtn.addEventListener("click", async () => {
  if (busy) return;
  const localPart = confirmDeleteBtn.dataset.localPart;
  if (!localPart) {
    confirmDeleteDialog.close();
    return;
  }

  await runOperation(async (config) => {
    setStatus(`Deleting ${localPart}…`);
    await deleteAlias(localPart, config);
    confirmDeleteDialog.close();
    const aliases = allAliases.filter((x) => x.local_part !== localPart);
    await commitAliases(config, aliases, `Deleted ${localPart}.`);
  });
});

cancelDeleteBtn.addEventListener("click", () => {
  confirmDeleteDialog.close();
});

confirmDeleteDialog.addEventListener("close", () => {
  delete confirmDeleteBtn.dataset.localPart;
});

confirmDeleteDialog.addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});

createBtn.addEventListener("click", async (): Promise<void> => {
  await runOperation(async (config) => {
    setStatus("Creating...");

    const localPart = localPartEl.value.trim();
    const destinationsCsv = destinationsEl.value.trim();

    if (!localPart) throw new Error("Empty local part.");
    if (!destinationsCsv) throw new Error("Empty destinations.");

    const created = await createAlias(
      { localPart, destinationsCsv, isInternal: isInternalEl.checked },
      config,
    );

    // Limpia UI
    localPartEl.value = "";
    destinationsEl.value = "";
    isInternalEl.checked = false;
    createBox.classList.add("hidden");

    const aliases = [
      created,
      ...allAliases.filter((alias) => alias.local_part !== created.local_part),
    ];
    const applied = await commitAliases(config, aliases, `Created ${created.address}.`);
    if (!applied) return;
    const status = statusEl.textContent;
    const copiedAlias = await copyAlias(created, undefined, false);
    const copyStatus = copiedAlias ? `Copied ${copiedAlias}. ` : "Copy to clipboard failed. ";
    setStatus(`${status} ${copyStatus}Migadu changes may take a few minutes to propagate.`);
  });
});

let t: number | undefined;

searchEl.addEventListener("input", () => {
  if (busy) return;
  window.clearTimeout(t);
  t = window.setTimeout(() => {
    if (busy) return;
    const filtered = filterAliases(searchEl.value, allAliases);
    render(filtered, allAliases.length);

    setStatus(
      allAliases.length
        ? `Cache · ${filtered.length}/${allAliases.length} aliases`
        : "Empty cache · press ↻",
    );
  }, 80);
});

void load();
