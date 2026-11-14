# Telvyo owner integration setup

Goal: publish `/admin` so the owner can sign in, follow secure credential setup, see configuration availability and test documented MTN OAuth authentication. The current app has no administration login or live backend.

Use existing Sites sign-in and preserve the current Site audience. Every admin page/API checks a server-injected user ID plus an exact server-configured owner email allowlist. The allowlist is a deployment access policy, not a user-record identifier; changing the owner email requires updating the runtime setting. Service access without visitor identity is rejected.

Credential entry uses the existing owner-only ChatGPT Sites Settings environment/secret UI. Credentials are server runtime secrets, never accepted by this app's API, returned to browsers, stored in localStorage, included in source/mobile downloads, or logged. The admin page gives exact key names and setup instructions. R2 stores only a bounded connection-check result and a lease to limit repeated checks across instances; no raw credentials or tokens.

Support configuration status for MTN Developer Platform API-key and OAuth credentials, environment and product selections. A fixed documented production OAuth token request verifies application authentication only, never subscriber/product approval. Sandbox and API-key checks remain unavailable until exact approved product documentation is supplied. No arbitrary URLs or subscriber-number lookups.

Preserve yellow/ivory/charcoal styling with blue/red accents. Show a clear sign-in state, owner-only status, missing configuration, and the difference between authentication and subscriber data access. Keep admin files outside native app assets. The existing tracker, local records and APK downloads remain intact.

Implementation choice: Sites already provides secure settings; use it instead of a second credential database or a separate identity provider. Publish a Worker that protects admin paths and serves unchanged existing static assets through ASSETS.

Verify unauthorized identity, cross-origin test requests, response redaction, input bounds, shared cooldown, configuration rotation, provider failure sanitization and UI status states. Live MTN testing requires credentials configured by the owner. Physical-device and browser visual QA remain unavailable.
