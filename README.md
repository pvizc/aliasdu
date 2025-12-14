# aliasdu

**aliasdu** is a lightweight Chrome extension to manage **Migadu email aliases** directly from your browser.

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
- 💾 Local cache via `chrome.storage.local`

---

## How it works

- The extension stores your Migadu API credentials **locally** using `chrome.storage.local`
- Aliases are fetched **only when you click Refresh**
- All filtering and searching happens locally
- Creating / deleting aliases updates the local cache immediately (no forced refetch)

---

## Installation (Development)

```bash
git clone https://github.com/pvizc/aliasdu.git
cd aliasdu
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

---

## Configuration

Open the extension options page and provide:

- **Email**: Migadu API user (e.g. `admin@yourdomain.com`)
- **API token**
- **Domain**

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
