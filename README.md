# aliasdu

**aliasdu** is a lightweight Chrome and Firefox extension to manage **Migadu email aliases** directly from your browser.

It focuses on a clean, minimal UI (Migadu-inspired), local caching, and zero background noise: no tracking, no accounts, no unnecessary fetches.

> ⚠️ This is an **unofficial** extension and is not affiliated with Migadu.

---

## Features

- 🔐 Secure configuration using Migadu API credentials (stored locally)
- 📋 List existing address aliases
- ➕ Create new aliases
- 🗑️ Delete aliases
- 🔍 Local search (instant, no network calls)
- ♻️ Manual refresh (no automatic API polling)
- 💾 Local cache via `storage.local`

---

## How it works

- The extension stores your Migadu API credentials **locally** using `storage.local`
- Aliases are fetched **only when you click Refresh**
- All filtering and searching happens locally
- Creating / deleting aliases updates the local cache immediately (no forced refetch)
- The cache belongs to the configured API user and domain. Changing either requires a manual refresh
- Refresh, create and delete operations run one at a time. Responses for a previous configuration are discarded
- If Migadu succeeds but saving the cache fails, the UI keeps the successful result and displays a cache warning

Older caches without account information are ignored. Click Refresh once after upgrading.

---

## Installation (Development)

Use Node.js 24 and pnpm 12.9.1 (the version declared in `package.json`).

```bash
git clone https://github.com/pvizc/aliasdu.git
cd aliasdu
pnpm install
pnpm build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

Or in Firefox 140 or later:

```bash
pnpm firefox
```

This builds the extension and opens it in a temporary Firefox profile. To load it in your own
profile instead, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and
select `dist/manifest.json`. Temporary add-ons are removed when Firefox closes.

If you revoke access to `api.migadu.com`, the options page offers a button to allow it again.

---

## Configuration

Open the extension options page and provide:

- **Email**: Migadu API user (e.g. `admin@yourdomain.com`)
- **API token**
- **Domain**

Optional alias domains affect only the address copied to the clipboard; API requests always use
the configured API domain. An empty list stays empty.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm lint:firefox
pnpm package
```

The tests build the extension and exercise its popup and options with a simulated DOM,
browser storage and Migadu API. They do not contact Migadu or use real credentials.

## Publishing to Firefox Add-ons

Vite bundles and minifies the code, so Mozilla requires the source code along with the package.
Build both from a clean clone of the commit being released, using Node.js 24 and pnpm 12.9.1:

```bash
pnpm install --frozen-lockfile
pnpm package
git archive --format=zip -o source.zip HEAD
```

Upload `extension.zip` as the add-on and `source.zip` as its source code. A reviewer can reproduce
`dist/` from the source with the commands above and `pnpm build`.

---

## Security Notes

- Credentials are stored **only locally**
- No data is sent anywhere except Migadu’s official API
- No analytics, no tracking, no background polling

Still, use at your own risk and review the code before use.

---

## Disclaimer

This project is **not affiliated with Migadu**.
Migadu is a trademark of its respective owners.
