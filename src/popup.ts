import "./styles.css";
import { createAlias, deleteAlias, listAliases } from "./migadu";
import type { MigaduAlias, MigaduStorage } from "./types";
import { createIcons, AtSign, RefreshCw, CirclePlus } from "lucide";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
};

const searchEl = $<HTMLInputElement>("search");
let allAliases: MigaduAlias[] = [];

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
  refreshBtn.disabled = !enabled;
  addBtn.disabled = !enabled;
  searchEl.disabled = !enabled;

  refreshBtn.title = enabled ? "Refresh" : missingConfigMessage;
  addBtn.title = enabled ? "New alias" : missingConfigMessage;
  searchEl.placeholder = enabled ? "Search..." : "Configure Migadu to search aliases";

  if (!enabled) {
    createBox.classList.add("hidden");
  }
}

async function hasCompleteConfig(): Promise<boolean> {
  const { migadu } = (await chrome.storage.local.get("migadu")) as MigaduStorage;

  const user = migadu?.user?.trim();
  const token = migadu?.token?.trim();
  const aliasDomains = Array.isArray(migadu?.domains)
    ? migadu.domains.map((d) => d.trim()).filter(Boolean)
    : [];
  const domain = migadu?.domain?.trim() ?? (aliasDomains.length > 0 ? aliasDomains[0] : undefined);

  return Boolean(user && token && domain);
}

function renderMissingConfig(): void {
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

async function copyAlias(alias: MigaduAlias, trigger?: HTMLButtonElement): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable or permission denied.");
    }

    trigger && (trigger.disabled = true);
    const toCopy = buildAliasToCopy(alias);

    await navigator.clipboard.writeText(toCopy);
    setStatus(`Copied ${toCopy}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setStatus(`Copy failed: ${message}`);
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
  domainSelectorBtn.disabled = availableDomains.length === 0;
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

    btn.addEventListener("click", async () => {
      closeDomainMenu();
      await setDefaultAliasDomain(value);
    });

    domainMenuEl.append(btn);
  }
}

async function loadDomains(): Promise<void> {
  const { migadu = {} } = (await chrome.storage.local.get("migadu")) as MigaduStorage;

  const legacyDomain = migadu.domain?.trim();
  const storedDomains = Array.isArray(migadu.domains)
    ? migadu.domains.map((d) => d.trim()).filter(Boolean)
    : [];
  const normalized = storedDomains.length > 0 ? storedDomains : legacyDomain ? [legacyDomain] : [];
  availableDomains = Array.from(new Set(normalized.filter(Boolean) as string[]));

  defaultAliasDomain =
    migadu.defaultAliasDomain && availableDomains.includes(migadu.defaultAliasDomain)
      ? migadu.defaultAliasDomain
      : null;

  updateDomainSelectorLabel();
  renderDomainMenu();
}

async function setDefaultAliasDomain(domain: string | null): Promise<void> {
  const { migadu = {} } = (await chrome.storage.local.get("migadu")) as MigaduStorage;

  const legacyDomain = migadu.domain?.trim();
  const storedDomains = Array.isArray(migadu.domains)
    ? migadu.domains.map((d) => d.trim()).filter(Boolean)
    : [];
  const normalizedDomains = Array.from(
    new Set(
      (storedDomains.length > 0 ? storedDomains : legacyDomain ? [legacyDomain] : []).filter(
        Boolean,
      ) as string[],
    ),
  );

  const normalized = domain && normalizedDomains.includes(domain) ? domain : null;
  await chrome.storage.local.set({
    migadu: {
      ...migadu,
      domains: normalizedDomains,
      defaultAliasDomain: normalized,
    },
  });

  availableDomains = normalizedDomains;
  defaultAliasDomain = normalized;
  updateDomainSelectorLabel();
  renderDomainMenu();
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
    copyBtn.addEventListener("click", () => void copyAlias(a, copyBtn));

    const del = document.createElement("button");
    del.type = "button";
    del.className =
      "mt-0.5 shrink-0 text-xs font-semibold text-rose-600 opacity-80 hover:opacity-100 group-hover:underline";
    del.textContent = "Delete";

    del.addEventListener("click", async (event) => {
      event.stopPropagation();

      try {
        del.disabled = true;
        setStatus(`Deleting ${a.local_part}…`);
        await deleteAlias(a.local_part);

        allAliases = allAliases.filter((x) => x.local_part !== a.local_part);
        await chrome.storage.local.set({ aliasCache: { at: Date.now(), aliases: allAliases } });

        const filtered = filterAliases(searchEl.value, allAliases);
        render(filtered, allAliases.length);
        setStatus(`Deleted · ${filtered.length}/${allAliases.length} aliases`);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      } finally {
        del.disabled = false;
      }
    });

    actions.append(copyBtn, del);
    row.append(left, actions);
    row.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) return;

      void copyAlias(a);
    });
    listEl.appendChild(row);
  }
}

async function readCache(): Promise<MigaduAlias[]> {
  const { aliasCache } = (await chrome.storage.local.get("aliasCache")) as MigaduStorage;
  return aliasCache?.aliases ?? [];
}

async function writeCache(aliases: MigaduAlias[]): Promise<void> {
  await chrome.storage.local.set({ aliasCache: { at: Date.now(), aliases } });
}

async function load(): Promise<void> {
  const configured = await hasCompleteConfig();
  setControlAvailability(configured);
  if (!configured) {
    renderMissingConfig();
    return;
  }

  const aliases = await readCache();
  allAliases = aliases;

  const filtered = filterAliases(searchEl.value, allAliases);
  render(filtered, allAliases.length);

  setStatus(
    aliases.length
      ? `Cache · ${filtered.length}/${aliases.length} aliases`
      : "Empty cache · press ↻",
  );
}

async function refresh(): Promise<void> {
  try {
    const configured = await hasCompleteConfig();
    setControlAvailability(configured);
    if (!configured) {
      renderMissingConfig();
      return;
    }

    setStatus("Updating...");

    const aliases = await listAliases();

    await writeCache(aliases);
    allAliases = aliases;
    render(filterAliases(searchEl.value, allAliases), allAliases.length);
    setStatus(`OK · ${aliases.length} aliases`);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e));
  }
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
  createBox.classList.toggle("hidden");
});

cancelBtn.addEventListener("click", () => {
  createBox.classList.add("hidden");
});

createBtn.addEventListener("click", async (): Promise<void> => {
  try {
    createBtn.disabled = true;
    setStatus("Creating...");

    const localPart = localPartEl.value.trim();
    const destinationsCsv = destinationsEl.value.trim();

    if (!localPart) throw new Error("Empty local part.");
    if (!destinationsCsv) throw new Error("Empty destinations.");

    const created = await createAlias({
      localPart,
      destinationsCsv,
      isInternal: isInternalEl.checked,
    });

    const createdNormalized: MigaduAlias = {
      ...created,
      is_internal:
        typeof (created as any).is_internal === "string"
          ? (created as any).is_internal === "true"
          : created.is_internal,
      destinations: Array.isArray(created.destinations) ? created.destinations : [],
    };

    void copyAlias(createdNormalized);

    // Limpia UI
    localPartEl.value = "";
    destinationsEl.value = "";
    isInternalEl.checked = false;
    createBox.classList.add("hidden");

    // Actualiza cache + estado local (sin fetch)
    allAliases = [createdNormalized, ...allAliases];
    await chrome.storage.local.set({ aliasCache: { at: Date.now(), aliases: allAliases } });

    // Respeta búsqueda
    const filtered = filterAliases(searchEl.value, allAliases);
    render(filtered, allAliases.length);
    setStatus(
      `Created · ${filtered.length}/${allAliases.length} aliases (copied to clipboard). Migadu changes may take a few minutes to propagate.`,
    );
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e));
  } finally {
    createBtn.disabled = false;
  }
});

let t: number | undefined;

searchEl.addEventListener("input", () => {
  window.clearTimeout(t);
  t = window.setTimeout(() => {
    const filtered = filterAliases(searchEl.value, allAliases);
    render(filtered, allAliases.length);

    setStatus(
      allAliases.length
        ? `Cache · ${filtered.length}/${allAliases.length} aliases`
        : "Empty cache · press ↻",
    );
  }, 80);
});

void loadDomains();
void load();
