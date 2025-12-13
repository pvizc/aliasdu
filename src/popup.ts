import { createAlias, deleteAlias, listAliases } from "./migadu";
import type { MigaduAlias, MigaduStorage } from "./types";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
};

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

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function render(aliases: MigaduAlias[]): void {
  listEl.innerHTML = "";

  if (!aliases.length) {
    listEl.innerHTML = `<div class="muted">No aliases yet.</div>`;
    return;
  }

  for (const a of aliases) {
    const row = document.createElement("div");
    row.className = "row card";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="addr"><strong>${a.address}</strong></div>
      <div class="muted">${(a.destinations ?? []).join(", ")}</div>
    `;

    const del = document.createElement("button");
    del.textContent = "Borrar";
    del.addEventListener("click", async (): Promise<void> => {
      try {
        del.disabled = true;
        setStatus(`Borrando ${a.local_part}…`);
        await deleteAlias(a.local_part);
        await refresh();
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

function isAliasArray(x: unknown): x is MigaduAlias[] {
  return Array.isArray(x);
}

async function load(): Promise<void> {
  const aliases = await readCache();
  render(aliases);
  setStatus(aliases.length ? `Cache · ${aliases.length} aliases` : "Cache vacío · pulsa ↻");
}

async function refresh(): Promise<void> {
  try {
    setStatus("Actualizando…");

    const data = (await listAliases()) as { address_aliases?: MigaduAlias[] };
    const aliases = data.address_aliases ?? [];

    await writeCache(aliases);
    render(aliases);
    setStatus(`OK · ${aliases.length} aliases`);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e));
  }
}

refreshBtn.addEventListener("click", () => void refresh());

addBtn.addEventListener("click", (): void => {
  createBox.style.display = createBox.style.display === "none" ? "block" : "none";
});

cancelBtn.addEventListener("click", (): void => {
  createBox.style.display = "none";
});

createBtn.addEventListener("click", async (): Promise<void> => {
  try {
    createBtn.disabled = true;
    setStatus("Creando…");

    const localPart = localPartEl.value.trim();
    const destinationsCsv = destinationsEl.value.trim();

    if (!localPart) throw new Error("Empty local part.");
    if (!destinationsCsv) throw new Error("Empty destinations.");

    await createAlias({
      localPart,
      destinationsCsv,
      isInternal: isInternalEl.checked,
    });

    localPartEl.value = "";
    destinationsEl.value = "";
    isInternalEl.checked = false;
    createBox.style.display = "none";

    await refresh();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e));
  } finally {
    createBtn.disabled = false;
  }
});

void load();
