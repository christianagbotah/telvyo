# In-app daily data budgets

Telvyo can show **per-SIM daily progress** based on manually logged usage. The current implementation has no push notifications, no background usage monitor and no direct carrier usage-feed integration in public web mode.

The Overview page shows one progress bar for each configured SIM, with the daily limit set under **My SIMs**.

- **Under 80%:** within the manually set daily budget.
- **80% to below 100%:** approaching the daily budget; a small bell notification indicator appears in the personal workspace.
- **100% or more:** budget reached; the panel states how much logged usage exceeds the limit.
- The bell opens an explanation modal listing each SIM's usage; in the sample/demo workspace the alert indicator is intentionally suppressed so demo records cannot appear to be a live personal warning.

The source is strictly **valid usage records saved to the personal local ledger**. The calculation uses local-calendar Today in the device's time zone and isolates each SIM. It does not add Android OS aggregate snapshots to individual SIMs, infer which SIM was used, or calculate official carrier bills, promotions, bundle expirations or remaining balances. On-device entry dates and storage quality affect the accuracy of the warning. Switching from Wi-Fi to cellular or having data consumed by unrecorded background apps is not automatically reflected in the browser ledger.

Tests: `tests/model.test.mjs` checks the 80%/100% thresholds, historical/future/invalid records and SIM isolation. `tests/budget-ui.test.mjs` verifies UI progress indicators, accessible values, source disclosures and demo warning suppression.

Before public mobile launch, verify large-font layouts, real-world usage measurement provenance, timezone/day boundaries, and OS permission changes on physical Android devices. Automated mobile usage data must remain separate from these manual SIM totals unless carrier attribution is independently verified.
