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

function filterAliases(q: string, aliases: MigaduAlias[]): MigaduAlias[] {
  const query = q.trim().toLowerCase();
  if (!query) return aliases;

  return aliases.filter((a) => {
    const haystack =
      `${a.address} ${(a.destinations ?? []).join(", ")} ${a.local_part}`.toLowerCase();
    return haystack.includes(query);
  });
}

function render(aliases: MigaduAlias[]): void {
  listEl.innerHTML = "";

  if (!aliases.length) {
    listEl.innerHTML = `<div class="border-l-2 border-lime-500 bg-slate-50/50 p-3 text-sm text-slate-600">
        Cache vacío. Pulsa <span class="font-semibold">↻</span>.
      </div>`;
    return;
  }

  for (const a of aliases) {
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

    const del = document.createElement("button");
    del.type = "button";
    del.className =
      "mt-0.5 shrink-0 text-xs font-semibold text-rose-600 opacity-80 hover:opacity-100 group-hover:underline";
    del.textContent = "Delete";

    del.addEventListener("click", async () => {
      try {
        del.disabled = true;
        setStatus(`Deleting ${a.local_part}…`);
        await deleteAlias(a.local_part);

        // modo “sin fetch”: actualiza cache + render
        const remaining = aliases.filter((x) => x.local_part !== a.local_part);
        await chrome.storage.local.set({ aliasCache: { at: Date.now(), aliases: remaining } });
        render(remaining);
        setStatus(`Deleted · ${remaining.length} aliases`);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      } finally {
        del.disabled = false;
      }
    });

    row.append(left, del);
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
  const aliases = await readCache();
  allAliases = aliases;

  const filtered = filterAliases(searchEl.value, allAliases);
  render(filtered);

  setStatus(
    aliases.length
      ? `Cache · ${filtered.length}/${aliases.length} aliases`
      : "Empty cache · press ↻",
  );
}

async function refresh(): Promise<void> {
  try {
    setStatus("Updating...");

    const aliases = await listAliases();

    await writeCache(aliases);
    allAliases = aliases;
    render(filterAliases(searchEl.value, allAliases));
    setStatus(`OK · ${aliases.length} aliases`);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e));
  }
}

refreshBtn.addEventListener("click", () => void refresh());

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
    render(filtered);
    setStatus(`Creado · ${filtered.length}/${allAliases.length} aliases`);
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
    render(filtered);

    setStatus(
      allAliases.length
        ? `Cache · ${filtered.length}/${allAliases.length} aliases`
        : "Empty cache · press ↻",
    );
  }, 80);
});

void load();
