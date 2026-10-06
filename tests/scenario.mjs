import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const scenario = process.argv[2];
const page = scenario.startsWith("options") ? "options" : "popup";
const html = await readFile(new URL(`../dist/${page}.html`, import.meta.url), "utf8");
const window = new Window({ settings: { disableJavaScriptFileLoading: true } });
window.document.write(html);
for (const name of ["document", "MutationObserver", "HTMLElement", "Node"]) {
  globalThis[name] = window[name];
}
globalThis.window = window;
const $ = (id) => document.getElementById(id);
const delay = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await delay();
  }
  throw new Error(`Timed out in ${scenario}: ${$("status").textContent}`);
}
const config = {
  user: "test@example.com",
  token: "test-token",
  domain: "example.com",
  domains: ["alias.example.com"],
  defaultAliasDomain: "alias.example.com",
};
const alias = {
  address: "existing@example.com",
  local_part: "existing",
  destinations: ["inbox@example.com"],
};
const store = { migadu: structuredClone(config) };
if (scenario.endsWith("empty-domains")) {
  store.migadu.domains = [];
  store.migadu.defaultAliasDomain = null;
}
if (scenario === "options-legacy-domains") delete store.migadu.domains;
if (scenario === "options-selector-override" || scenario === "popup-selector-override") {
  store.aliasDomainSelection = { user: config.user, domain: config.domain, value: null };
}
if (scenario === "popup-legacy-cache") {
  store.aliasCache = { at: Date.now(), aliases: [alias] };
}
if (scenario === "popup-scoped-cache" || scenario === "popup-other-account-cache") {
  store.aliasCache = {
    user: scenario === "popup-scoped-cache" ? config.user : "other@example.com",
    domain: config.domain,
    at: Date.now(),
    aliases: [alias],
  };
}
let failCacheWrites = false;
let failReads = scenario.endsWith("startup-error");
let deferStorageWrite = false;
let pendingStorageWrite;
const changes = new Set();
const runtime = {};
function callbackFailure(callback, message) {
  runtime.lastError = { message };
  callback();
  delete runtime.lastError;
}
function save(values) {
  const events = {};
  for (const [key, value] of Object.entries(values)) {
    events[key] = { oldValue: store[key], newValue: value };
    store[key] = structuredClone(value);
  }
  for (const listener of changes) listener(events, "local");
}
globalThis.chrome = {
  runtime,
  storage: {
    onChanged: {
      addListener: (listener) => changes.add(listener),
      removeListener: (listener) => changes.delete(listener),
    },
    local: {
      get(key, callback) {
        if (failReads) {
          callbackFailure(callback, "Storage unavailable");
        } else callback({ [key]: structuredClone(store[key]) });
      },
      set(values, callback) {
        if (deferStorageWrite) {
          pendingStorageWrite = { values: structuredClone(values), callback };
          return;
        }
        if (failCacheWrites && "aliasCache" in values) {
          callbackFailure(callback, "Cache write denied");
        } else {
          save(values);
          callback();
        }
      },
      remove(keys, callback) {
        for (const key of [keys].flat()) delete store[key];
        callback();
      },
      clear(callback) {
        for (const key of Object.keys(store)) delete store[key];
        callback();
      },
    },
  },
};
const copied = [];
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    clipboard: {
      async writeText(value) {
        copied.push(value);
      },
    },
  },
});
const requests = [];
let deferredList;
globalThis.fetch = async (url, options = {}) => {
  requests.push({ url, options });
  assert.equal(options.headers.Authorization, `Basic ${btoa(`${config.user}:${config.token}`)}`);
  if (options.method === "DELETE") return new Response(null, { status: 204 });
  if (options.method === "POST") {
    const input = JSON.parse(options.body);
    return Response.json({
      address: `${input.local_part}@example.com`,
      local_part: input.local_part,
      destinations: [input.destinations],
    });
  }
  if (deferredList) await deferredList.promise;
  return Response.json({ address_aliases: [alias] });
};
const script = html.match(/<script[^>]*src="([^"]+\.js)"/)[1];
await import(
  pathToFileURL(new URL(`../dist/${script.replace(/^\//, "")}`, import.meta.url).pathname)
);

async function refresh() {
  $("refresh").click();
  await until(() => $("list").textContent.includes(alias.address) && !$("refresh").disabled);
}
async function create() {
  $("add").click();
  $("localPart").value = "new";
  $("destinations").value = "inbox@example.com";
  $("createBtn").click();
  await until(() => $("list").textContent.includes("new@example.com") && !$("createBtn").disabled);
}
function openDelete(localPart = "existing") {
  const rows = [...$("list").children];
  const row = rows.find((row) => row.textContent.includes(`${localPart}@example.com`));
  assert.ok(row, `Missing alias ${localPart}`);
  [...row.querySelectorAll("button")].find((button) => button.textContent === "Delete").click();
}
async function remove(localPart = "existing") {
  openDelete(localPart);
  $("confirmDeleteBtn").click();
  await until(
    () =>
      !$("confirmDeleteDialog").open && !$("list").textContent.includes(`${localPart}@example.com`),
  );
}

try {
  if (scenario.endsWith("startup-error")) {
    await until(() => $("status").textContent.includes("Storage unavailable"));
    if (page === "options") {
      assert.equal($("save").disabled, true);
      $("save").click();
      assert.deepEqual(store.migadu, config);
    } else {
      assert.equal($("refresh").disabled, false, "Initialization failure must allow retry");
      failReads = false;
      await refresh();
    }
  } else if (page === "options") {
    await until(() => $("user").value === config.user && !$("save").disabled);
    if (scenario === "options-empty-domains") {
      assert.equal($("domains").value, "");
      $("save").click();
      await until(() => $("status").textContent === "Save OK");
      assert.deepEqual(store.migadu.domains, []);
    } else if (scenario === "options-legacy-domains") {
      assert.equal($("domains").value, config.domain);
    } else if (scenario === "options-selector-override") {
      assert.equal(
        $("defaultAliasDomain").value,
        "",
        "Saved None selection must appear in Options",
      );
      $("defaultAliasDomain").value = config.domains[0];
      $("save").click();
      await until(() => $("status").textContent === "Save OK");
      assert.equal(store.migadu.defaultAliasDomain, config.domains[0]);
      assert.equal(
        store.aliasDomainSelection,
        null,
        "Options save must clear the separate override",
      );
    } else {
      for (const field of ["user", "token", "domain"]) {
        $(field).value = " ";
        $("save").click();
        await until(() => $("status").textContent.length > 0);
        assert.notEqual($("status").textContent, "Save OK");
        assert.equal(store.migadu[field], config[field]);
        $(field).value = config[field];
        $("status").textContent = "";
      }
      $("user").value = "invalid-address";
      $("save").click();
      await until(() => !$("save").disabled && $("status").textContent.length > 0);
      assert.match($("status").textContent, /valid email/i);
      assert.equal(store.migadu.user, config.user);
    }
  } else {
    await until(
      () => /^(Cache|Empty cache)/.test($("status").textContent) && !$("refresh").disabled,
    );
    assert.equal(requests.length, 0, "Startup must not fetch Migadu");
    if (scenario === "popup-empty-domains") {
      assert.equal($("domainSelectorLabel").textContent, "No alias domains");
      assert.equal($("domainSelector").disabled, true);
    } else if (scenario === "popup-legacy-cache" || scenario === "popup-other-account-cache") {
      assert.ok(
        !$("list").textContent.includes(alias.address),
        "Unscoped cache must not expose actionable aliases",
      );
    } else if (scenario === "popup-scoped-cache") {
      assert.ok($("list").textContent.includes(alias.address));
      assert.equal(requests.length, 0);
    } else if (scenario === "popup-selector-override") {
      assert.equal($("domainSelectorLabel").textContent, "None");
      await refresh();
      $("list").querySelector("button").click();
      await until(() => copied.length === 1);
      assert.equal(copied[0], alias.address);
    } else if (
      scenario === "popup-selector-persistence" ||
      scenario === "popup-selector-config-race"
    ) {
      if (scenario.endsWith("race")) deferStorageWrite = true;
      $("domainSelector").click();
      [...$("domainMenu").querySelectorAll("button")]
        .find((button) => button.textContent.trim().startsWith("None"))
        .click();
      if (scenario.endsWith("race")) {
        await until(() => pendingStorageWrite !== undefined);
        const changed = {
          ...config,
          user: "new@example.com",
          token: "new-token",
          domain: "new.example.com",
        };
        save({ migadu: changed, aliasDomainSelection: null });
        deferStorageWrite = false;
        save(pendingStorageWrite.values);
        pendingStorageWrite.callback();
        await delay(50);
        assert.deepEqual(
          store.migadu,
          changed,
          "Selector writes must not overwrite newly saved credentials",
        );
      } else {
        await until(() => store.aliasDomainSelection !== undefined);
        assert.deepEqual(store.aliasDomainSelection, {
          user: config.user,
          domain: config.domain,
          value: null,
        });
        assert.deepEqual(
          store.migadu,
          config,
          "Selector must persist independently from API configuration",
        );
        await until(() => $("domainSelectorLabel").textContent === "None");
      }
    } else if (scenario === "popup-config-change-during-refresh") {
      let release;
      deferredList = {
        promise: new Promise((resolve) => {
          release = resolve;
        }),
      };
      $("refresh").click();
      await until(() => requests.length === 1);
      save({ migadu: { ...store.migadu, domain: "other.example.com" } });
      release();
      await until(() => !$("refresh").disabled);
      assert.ok(!$("list").textContent.includes(alias.address));
      assert.equal(store.aliasCache, undefined, "Stale response must not populate cache");
    } else {
      await refresh();
      if (scenario === "popup-flow") {
        assert.equal(document.querySelectorAll("svg[data-lucide]").length, 3);
        $("list").querySelector("button").click();
        await until(() => copied.length === 1);
        assert.equal(copied[0], "existing@alias.example.com");
        $("search").value = "no-match";
        $("search").dispatchEvent(new window.Event("input"));
        await until(() => $("list").textContent.includes("No matches"));
        $("search").value = "";
        $("search").dispatchEvent(new window.Event("input"));
        await until(() => $("list").textContent.includes(alias.address));
        await create();
        await remove("new");
        assert.equal(store.aliasCache.aliases.length, 1);
        assert.equal(requests.length, 3);
      } else if (scenario === "popup-config-change") {
        openDelete();
        save({ migadu: { ...store.migadu, domain: "other.example.com" } });
        $("confirmDeleteBtn").click();
        await delay(100);
        assert.equal(
          requests.filter(({ options }) => options.method === "DELETE").length,
          0,
          "Changing domain while confirming must never delete the old row in the new domain",
        );
        assert.ok(!$("list").textContent.includes(alias.address));
      } else if (scenario.includes("storage-error")) {
        failCacheWrites = true;
        if (scenario.includes("create")) await create();
        else await remove();
        assert.match($("status").textContent, /cache/i);
        assert.match($("status").textContent, /created|deleted/i);
        assert.equal(
          requests.filter(({ options }) => options.method === "POST" || options.method === "DELETE")
            .length,
          1,
        );
      } else {
        let release;
        deferredList = {
          promise: new Promise((resolve) => {
            release = resolve;
          }),
        };
        $("refresh").click();
        await until(() => requests.length === 2);
        $("refresh").click();
        if (scenario.endsWith("create")) {
          $("add").click();
          $("localPart").value = "new";
          $("destinations").value = "inbox@example.com";
          $("createBtn").click();
        } else {
          const deleteButton = [...$("list").querySelectorAll("button")].find(
            (button) => button.textContent === "Delete",
          );
          deleteButton.click();
          $("confirmDeleteBtn").click();
        }
        await delay(40);
        assert.equal(
          requests.length,
          2,
          "A pending refresh must exclude duplicate refreshes and mutations",
        );
        release();
        await until(() => !$("refresh").disabled);
        if (scenario.endsWith("create")) {
          await create();
          assert.ok(store.aliasCache.aliases.some((entry) => entry.local_part === "new"));
        } else {
          await remove();
          assert.equal(store.aliasCache.aliases.length, 0);
        }
      }
    }
  }
} finally {
  await window.happyDOM.abort();
}
