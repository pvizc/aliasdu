import { test } from "node:test";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const run = promisify(execFile);

for (const scenario of [
  "options-empty-domains",
  "options-legacy-domains",
  "options-selector-override",
  "options-required-fields",
  "options-startup-error",
  "popup-startup-error",
  "popup-empty-domains",
  "popup-legacy-cache",
  "popup-scoped-cache",
  "popup-other-account-cache",
  "popup-selector-override",
  "popup-selector-persistence",
  "popup-selector-config-race",
  "popup-config-change-during-refresh",
  "popup-flow",
  "popup-config-change",
  "popup-refresh-create",
  "popup-refresh-delete",
  "popup-create-storage-error",
  "popup-delete-storage-error",
]) {
  test(scenario, async () => {
    await run(process.execPath, ["tests/scenario.mjs", scenario], {
      cwd: new URL("..", import.meta.url),
      timeout: 10000,
    });
  });
}
