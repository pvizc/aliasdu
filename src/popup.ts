import "./styles.css";
import browser from "webextension-polyfill";
import { createAlias, deleteAlias, listAliases } from "./migadu";
import type { MigaduAlias, MigaduConfig, MigaduStorage } from "./types";
import { createIcons, AtSign, RefreshCw, CirclePlus } from "lucide";
import Alpine from '@alpinejs/csp';
import { normalizeAliasList, storage } from "./storage";

document.addEventListener("alpine:init", () => {
  Alpine.data("aliasesUi", () => ({
    enabled: false,
    status: "",
    search: "",
    isRefreshing: false,
    copyingAddress: "" as string | null,
    missingConfig: false,
    missingConfigMessage: "Missing configuration. Open Options and add your user, API token and domain.",

    baseMailboxDomain: "",

    aliases: [] as MigaduAlias[],

    pendingDelete: null as MigaduAlias | null,
    deleting: false,

    // domains
    domains: [] as string[],
    defaultAliasDomain: null as string | null,
    domainMenuOpen: false,

    // create box
    createOpen: false,
    creating: false,

    createLocalPart: "",
    createDestinationsCsv: "",
    createIsInternal: false,

    async init() {
      this.setStatus("Loading...");

      queueMicrotask(() => void this.boot());
    },

    async boot() {
      try {
        const cfg = await storage.getResolvedConfig();

        if (!cfg) {
          this.setControlAvailability(false);
          this.renderMissingConfig();
          return;
        }

        this.missingConfig = false;
        this.setControlAvailability(true);

        // Config derivada (en vez de 2 awaits extra)
        this.domains = cfg.domains;
        this.defaultAliasDomain = cfg.defaultAliasDomain;
        this.baseMailboxDomain = cfg.domain;

        // Cache
        this.aliases = await storage.getCachedAliases();;

        this.setStatus(
          this.aliases.length
            ? `Cache · ${this.visible.length}/${this.totalCount} aliases`
            : "Empty cache · press ↻",
        );

        // Estos dos NO deberían bloquear el primer paint:
        //  void this.loadDomains();
        //  void this.loadBaseMailboxDomain();

      } catch (e) {
        this.setStatus(e instanceof Error ? e.message : String(e));
      }
    },

    get pendingDeleteLabel() {
      const a = this.pendingDelete;
      if (!a) return "";
      return a.address || a.local_part || "";
    },

    get cacheStatus() {
      if (!this.totalCount) return "Empty cache · press ↻";
      return `Cache · ${this.visible.length}/${this.totalCount} aliases`;
    },

    destinationsText(a: MigaduAlias) {
      const d = a && Array.isArray(a.destinations) ? a.destinations : [];
      return d.join(", ");
    },

    async loadBaseMailboxDomain() {
      const { migadu }: MigaduStorage = await browser.storage.local.get("migadu");
      const aliasDomains = Array.isArray(migadu?.domains)
        ? migadu.domains.map(d => String(d).trim()).filter(Boolean)
        : [];
      const domain = (migadu?.domain?.trim() ?? (aliasDomains[0] ?? "")).trim();
      this.baseMailboxDomain = domain;
    },

    toggleDomainMenu() {
      if (!this.enabled) return;
      this.domainMenuOpen = !this.domainMenuOpen;
    },

    async refresh() {
      if (this.isRefreshing) return;
      this.isRefreshing = true;
      try {
        const configured = await storage.hasCompleteConfig();
        this.enabled = configured;
        if (!configured) return;

        const aliases = await listAliases();
        await storage.setAliasCache(aliases);
        this.aliases = normalizeAliasList(aliases)
      } finally {
        this.isRefreshing = false;
      }
    },

    getConfirmDialog(): HTMLDialogElement | null {
      const el = (this.$refs.confirmDeleteDialog as unknown) as HTMLDialogElement | undefined;
      return el instanceof HTMLDialogElement ? el : null;
    },


    setControlAvailability(enabled: boolean) {
      this.enabled = !!enabled;
    },

    openDelete(alias: MigaduAlias) {
      this.pendingDelete = alias;
      this.getConfirmDialog()?.showModal();
    },

    async confirmDelete() {
      const a = this.pendingDelete;
      const localPart = (a?.local_part ?? "").trim();

      if (!localPart) {
        this.getConfirmDialog()?.close();
        return;
      }

      if (this.deleting) return;

      try {
        this.deleting = true;
        this.setStatus(`Deleting ${localPart}…`);

        await deleteAlias(localPart);

        // 1) persistencia canónica + count
        const cache = await storage.removeCachedAliasByLocalPart(localPart);

        // 2) estado UI desde cache plano
        this.aliases = cache.aliases;

        // 3) status + cerrar dialog
        this.setStatus(`Deleted · ${this.visible.length}/${cache.count} aliases`);
        this.getConfirmDialog()?.close();
      } catch (e) {
        this.setStatus(e instanceof Error ? e.message : String(e));
      } finally {
        this.deleting = false;
        this.pendingDelete = null;
      }
    },


    get totalCount() {
      return this.aliases.length;
    },

    get visible() {
      const q = this.search.trim().toLowerCase();
      if (!q) return this.aliases;

      return this.aliases.filter(a => {
        const hay = [
          a.address,
          a.local_part,
          ...(a.destinations ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return hay.includes(q);
      });
    },

    get refreshTitle() {
      return this.enabled ? "Refresh" : this.missingConfigMessage;
    },
    get addTitle() {
      return this.enabled ? "New alias" : this.missingConfigMessage;
    },
    get searchPlaceholder() {
      return this.enabled ? "Search..." : "Configure Migadu to search aliases";
    },
    setStatus(msg: string) {
      this.status = msg;
    },

    get domainLabel() {
      if (this.domains.length === 0) return "No alias domains";
      if (this.defaultAliasDomain) return this.defaultAliasDomain;
      return this.baseMailboxDomain ? `Base (${this.baseMailboxDomain})` : "None";
    },

    renderMissingConfig() {
      this.setControlAvailability(false);
      this.missingConfig = true;
      this.setStatus("Missing configuration.");
    },

    async copyAlias(alias: MigaduAlias) {
      const toCopy = this.buildAliasToCopy(alias);

      // Bloqueo UI para ESTE alias
      this.copyingAddress = alias.address;

      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error("Clipboard API unavailable or permission denied.");
        }

        await navigator.clipboard.writeText(toCopy);
        this.setStatus(`Copied ${toCopy}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.setStatus(`Copy failed: ${message}`);
      } finally {
        // libera
        if (this.copyingAddress === alias.address) this.copyingAddress = null;
      }
    },

    async loadDomains() {
      const { migadu = {} }: MigaduStorage = await browser.storage.local.get("migadu");

      const legacyDomain = (migadu.domain ?? "").trim() || null;
      const storedDomains = Array.isArray(migadu.domains)
        ? migadu.domains.map(d => String(d).trim()).filter(Boolean)
        : [];

      const normalized = storedDomains.length > 0
        ? storedDomains
        : legacyDomain
          ? [legacyDomain]
          : [];

      // unique
      this.domains = Array.from(new Set(normalized.filter(Boolean)));

      this.defaultAliasDomain =
        migadu.defaultAliasDomain && this.domains.includes(migadu.defaultAliasDomain)
          ? migadu.defaultAliasDomain
          : null;
    },

    async setDefaultAliasDomain(domain: string | null) {
      // 1) persistir (valida contra domains existentes y guarda null si no cuadra)
      await storage.setDefaultAliasDomain(domain);

      // 2) refrescar estado local desde storage resuelto
      const cfg = await storage.getResolvedConfig();
      this.domains = cfg?.domains ?? [];
      this.defaultAliasDomain = cfg?.defaultAliasDomain ?? null;

      // 3) UI
      this.domainMenuOpen = false;
    },

    buildAliasToCopy(alias: MigaduAlias) {
      const lp = (alias.local_part ?? "").trim();
      if (!lp) return (alias.address ?? "").trim(); // fallback razonable

      const chosen = (this.defaultAliasDomain ?? "").trim();
      const base = (this.baseMailboxDomain ?? "").trim();

      const domainToUse = chosen || base; // 👈 None => base mailbox domain
      return domainToUse ? `${lp}@${domainToUse}` : (alias.address ?? "").trim();
    },

    toggleCreate() {
      if (!this.enabled) return;
      this.createOpen = !this.createOpen;
    },

    closeCreate() {
      this.createOpen = false;
    },

    resetCreateForm() {
      this.createLocalPart = "";
      this.createDestinationsCsv = "";
      this.createIsInternal = false;
    },

    setCreateLocalPart(v: string) { this.createLocalPart = String(v ?? "").trimStart(); },
    setCreateDestinationsCsv(v: string) { this.createDestinationsCsv = String(v ?? ""); },
    setCreateIsInternal(v: string) { this.createIsInternal = !!v; },

    normalizeCreatedAlias(created: MigaduAlias) {
      const normalized = {
        ...created,
        is_internal:
          typeof created?.is_internal === "string"
            ? created.is_internal === "true"
            : created?.is_internal,
        destinations: Array.isArray(created?.destinations) ? created.destinations : [],
      };
      return normalized;
    },

    async createAliasFromForm() {
      if (this.creating) return;

      try {
        this.creating = true;
        this.setStatus("Creating...");

        const localPart = this.createLocalPart.trim();
        const destinationsCsv = this.createDestinationsCsv.trim();
        const isInternal = !!this.createIsInternal;

        if (!localPart) throw new Error("Empty local part.");
        if (!destinationsCsv) throw new Error("Empty destinations.");

        const created = await createAlias({ localPart, destinationsCsv, isInternal });

        // 1) persistencia canónica (normaliza + dedupe + count)
        const cache = await storage.upsertCachedAlias(created);

        // 2) actualiza estado UI desde el cache plano
        this.aliases = cache.aliases;

        // 3) copia (usando el alias ya normalizado)
        await this.copyAlias(cache.aliases[0]);

        // 4) limpia UI
        this.resetCreateForm();
        this.createOpen = false;

        // 5) status
        this.setStatus(
          `Created · ${this.visible.length}/${cache.count} aliases (copied to clipboard). Migadu changes may take a few minutes to propagate.`,
        );
      } catch (e) {
        this.setStatus(e instanceof Error ? e.message : String(e));
      } finally {
        this.creating = false;
      }
    },

  }));

  createIcons({ icons: { AtSign, RefreshCw, CirclePlus } });
});

Alpine.start();
