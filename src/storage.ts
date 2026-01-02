import browser from "webextension-polyfill";
import type { AliasCache, MigaduAlias, MigaduConfig, MigaduStorage } from "./types";

/** ---------- Normalización (anti-corrupción) ---------- **/

function normalizeDestinations(input: unknown): string[] {
    if (Array.isArray(input)) return input.map(String).map(s => s.trim()).filter(Boolean);
    if (typeof input === "string") return input.split(",").map(s => s.trim()).filter(Boolean);
    if (input && typeof input === "object") {
        return Object.values(input as Record<string, unknown>)
            .map(String)
            .map(s => s.trim())
            .filter(Boolean);
    }
    return [];
}

export function normalizeAlias(raw: unknown): MigaduAlias {
    const a: any = raw;
    return {
        address: String(a?.address ?? ""),
        local_part: String(a?.local_part ?? ""),
        destinations: [...normalizeDestinations(a?.destinations)],
        is_internal: typeof a?.is_internal === "string" ? a.is_internal === "true" : !!a?.is_internal,
    };
}

export function normalizeAliasList(raw: unknown): MigaduAlias[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeAlias);
}

function safeClone<T>(value: T): T {
    const sc = (globalThis as any).structuredClone as ((v: any) => any) | undefined;
    if (typeof sc === "function") return sc(value);
    return JSON.parse(JSON.stringify(value)) as T;
}

/** ---------- Config ---------- **/

function normalizeConfig(m: Partial<MigaduConfig> | undefined): MigaduConfig | null {
    const user = (m?.user ?? "").trim();
    const token = (m?.token ?? "").trim();

    const legacyDomain = (m?.domain ?? "").trim();
    const storedDomains = Array.isArray(m?.domains)
        ? m!.domains.map(d => String(d).trim()).filter(Boolean)
        : [];

    const domain = (legacyDomain || storedDomains[0] || "").trim();
    if (!user || !token || !domain) return null;

    const domains = Array.from(new Set(storedDomains.filter(Boolean)));
    const defaultAliasDomain =
        m?.defaultAliasDomain && domains.includes(m.defaultAliasDomain) ? m.defaultAliasDomain : null;

    return { user, token, domain, domains, defaultAliasDomain };
}

/** ---------- API pública ---------- **/

export const storage = {
    async getResolvedConfig(): Promise<MigaduConfig | null> {
        const { migadu } = (await browser.storage.local.get("migadu")) as MigaduStorage;
        return normalizeConfig(migadu);
    },

    async hasCompleteConfig(): Promise<boolean> {
        return (await this.getResolvedConfig()) !== null;
    },

    async getAliasDomains(): Promise<{ domains: string[]; defaultAliasDomain: string | null }> {
        const cfg = await this.getResolvedConfig();
        return { domains: cfg?.domains ?? [], defaultAliasDomain: cfg?.defaultAliasDomain ?? null };
    },

    async setDefaultAliasDomain(domain: string | null): Promise<void> {
        const { migadu = {} } = (await browser.storage.local.get("migadu")) as MigaduStorage;

        const storedDomains = Array.isArray(migadu.domains)
            ? migadu.domains.map(d => String(d).trim()).filter(Boolean)
            : [];

        const domains = Array.from(new Set(storedDomains.filter(Boolean)));
        const normalized = domain && domains.includes(domain) ? domain : null;

        await browser.storage.local.set({
            migadu: { ...migadu, domains, defaultAliasDomain: normalized },
        });
    },

    /** ---------- Alias cache (con count) ---------- **/

    async getAliasCache(): Promise<AliasCache | null> {
        const { aliasCache } = (await browser.storage.local.get("aliasCache")) as MigaduStorage;
        if (!aliasCache) return null;

        const at = typeof (aliasCache as any).at === "number" ? (aliasCache as any).at : 0;
        const aliases = normalizeAliasList((aliasCache as any).aliases);

        // compat hacia atrás: si no hay count, lo calculamos
        const countRaw = (aliasCache as any).count;
        const count = typeof countRaw === "number" ? countRaw : aliases.length;

        return { at, count, aliases };
    },

    async getCachedAliases(): Promise<MigaduAlias[]> {
        const cache = await this.getAliasCache();
        return cache?.aliases ?? [];
    },

    async getCachedCount(): Promise<number> {
        const cache = await this.getAliasCache();
        return cache?.count ?? 0;
    },

    async setAliasCache(aliases: unknown[], at = Date.now()): Promise<void> {
        const normalized = normalizeAliasList(aliases);
        const payload: AliasCache = safeClone({
            at,
            count: normalized.length,
            aliases: normalized,
        });
        await browser.storage.local.set({ aliasCache: payload });
    },

    async upsertCachedAlias(alias: unknown): Promise<AliasCache> {
        const one = normalizeAlias(alias);
        const current = await this.getAliasCache();
        const list = current?.aliases ?? [];

        const nextAliases = [one, ...list.filter(a => a.local_part !== one.local_part)];
        const next: AliasCache = { at: Date.now(), count: nextAliases.length, aliases: nextAliases };

        await browser.storage.local.set({ aliasCache: safeClone(next) });
        return next;
    },

    async removeCachedAliasByLocalPart(localPart: string): Promise<AliasCache> {
        const lp = String(localPart ?? "").trim();
        const current = await this.getAliasCache();
        const list = current?.aliases ?? [];

        const nextAliases = list.filter(a => a.local_part !== lp);
        const next: AliasCache = { at: Date.now(), count: nextAliases.length, aliases: nextAliases };

        await browser.storage.local.set({ aliasCache: safeClone(next) });
        return next;
    },

    async clearAliasCache(): Promise<void> {
        await browser.storage.local.remove("aliasCache");
    },
} as const;
