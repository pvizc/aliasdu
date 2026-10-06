# Privacy Policy for aliasdu

Last updated: October 6, 2026

aliasdu is an unofficial browser extension developed by Paulo Vizcaíno to manage Migadu email aliases. It is not affiliated with or endorsed by Migadu.

## Information the extension handles

To provide its features, aliasdu handles:

- The Migadu API user email address and API token you enter in the settings.
- Your configured API domain, optional alias domains, and domain preferences.
- Alias information retrieved from Migadu or entered by you, including alias addresses, destination email addresses, and whether an alias is internal.
- Local cache metadata, including the associated API user and domain and the time the alias list was cached.

The extension does not access email message contents, browsing history, location, health information, or financial information. It does not include analytics, advertising, tracking, or usage telemetry.

## How information is used

Information is used only to authenticate with Migadu and let you view, search, create, delete, and copy email aliases. Domain preferences determine the address copied to your clipboard. The local cache lets you view and search previously retrieved aliases without repeating API requests.

API operations occur in response to your actions. The extension does not poll Migadu in the background.

## Local storage and security

Credentials, settings, preferences, and cached aliases are stored in your browser profile using `chrome.storage.local`. The extension does not use Chrome Sync to synchronize this information and does not send it to the developer or to a developer-operated server.

The extension does not add its own encryption to locally stored data. Its local storage depends on the protections provided by your browser, operating system, and device. Requests to Migadu use HTTPS to encrypt data in transit.

When you choose to copy an alias address, that address is written to your system clipboard, where it may be accessible to other applications according to your device's permissions.

## Information sent to Migadu

The extension sends authenticated requests to `https://api.migadu.com` using your API user email address and API token. Depending on the action, these requests include your configured domain, the alias identifier, destination email addresses, and the internal-alias setting needed to retrieve, create, or delete aliases.

Migadu receives these requests and their normal network metadata, such as your IP address. Migadu's handling and retention of information are governed by its own privacy policy and service terms.

aliasdu does not sell user data or share it for advertising, credit assessment, or lending. Data is transmitted to Migadu only as necessary to provide the extension's alias management features.

## Retention and deletion

Local settings and cached aliases persist between browser sessions until they are replaced, cleared, or removed with the extension. You can update your credentials and domain preferences in the extension's options page. To remove all information stored locally by aliasdu, uninstall the extension.

Uninstalling aliasdu does not delete aliases or other information held by Migadu and does not revoke your API token. You can delete aliases through the extension or Migadu and revoke your token through Migadu's account controls. To remove a copied address from your clipboard, clear the clipboard and any clipboard history using your device's controls.

## External links and support

The options page includes an optional link to Buy Me a Coffee. Opening it takes you to an external website governed by its own privacy policy; aliasdu does not send your stored credentials or aliases to that website.

If you contact the developer or submit a GitHub issue, any information you choose to include is handled through that platform. GitHub issues may be public. Do not include API tokens, credentials, or private alias information in a public issue.

## Limited Use

aliasdu's use and transfer of user data adhere to the Chrome Web Store User Data Policy, including its Limited Use requirements. User data is used only for the extension's stated alias management purpose, is not used for personalized advertising, and is not made available to the developer for routine human review.

## Changes to this policy

This policy may be updated to reflect changes to the extension's behavior. Updates will be published in this file with a revised last-updated date.

## Contact

For privacy questions, contact Paulo Vizcaíno through the [aliasdu GitHub repository](https://github.com/pvizc/aliasdu).
