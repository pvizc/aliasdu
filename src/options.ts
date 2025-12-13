import { MigaduConfig, MigaduStorage } from "./types";

console.log("[options] loaded");

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
};

const userEl = $<HTMLInputElement>("user");
const tokenEl = $<HTMLInputElement>("token");
const domainEl = $<HTMLInputElement>("domain");
const saveEl = $<HTMLButtonElement>("save");
const statusEl = $<HTMLElement>("status");

async function load(): Promise<void> {
  const { migadu = {} } = (await chrome.storage.local.get("migadu")) as MigaduStorage;

  userEl.value = migadu.user ?? "";
  tokenEl.value = migadu.token ?? "";
  domainEl.value = migadu.domain ?? "";
}

void load();

saveEl.addEventListener("click", async (): Promise<void> => {
  const migadu: MigaduConfig = {
    user: userEl.value.trim(),
    token: tokenEl.value.trim(),
    domain: domainEl.value.trim(),
  };

  await chrome.storage.local.set({ migadu });
  statusEl.textContent = "Guardado ✅";
});
